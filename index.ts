import si from 'systeminformation'

// Call ahead of time for timed rates
si.currentLoad().then(() => {})
si.disksIO().then(() => {})
si.networkStats().then(() => {})

let data: string

const server = Bun.serve({
  port: 9678,
  fetch (req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      server.upgrade(req)
      return
    }

    return new Response(data)
  },
  websocket: {
    open (ws) { ws.subscribe('updates') },
    message () {},
    close (ws) { ws.unsubscribe('updates') }
  }
})

async function loadStats () {
  const osInfo = await si.osInfo()
  const mem = await si.mem()
  const cpuTemperature = await si.cpuTemperature()
  const currentLoad = await si.currentLoad()
  const disksIO = await si.disksIO()
  const fsSize = await si.fsSize()
  const networkStats = await si.networkStats()
  const networkConnections = await si.networkConnections()

  data = JSON.stringify({
    v: 1,
    hostname: osInfo.hostname,
    memory: {
      total: mem.total,
      used: mem.used,
      active: mem.active,
      swap_total: mem.swaptotal,
      swap_used: mem.swapused
    },
    load: {
      current: currentLoad.currentLoad,
      user: currentLoad.currentLoadUser,
      system: currentLoad.currentLoadSystem,
      temp_avg: cpuTemperature.main,
      temp_max: cpuTemperature.max,
      cpus: currentLoad.cpus.map(cpu => ({
        current: cpu.load,
        user: cpu.loadUser,
        system: cpu.loadSystem,
      }))
    },
    disk: {
      read_sec: disksIO.rIO_sec,
      write_sec: disksIO.wIO_sec
    },
    fs: fsSize.map(fs => ({
      name: fs.fs,
      type: fs.type,
      size: fs.size,
      used: fs.used,
      mount: fs.mount
    })),
    networks: networkStats.map(net => ({
      interface: net.iface,
      state: net.operstate,
      transfer_sec: net.tx_sec,
      receive_sec: net.rx_sec,
      transfer: net.tx_bytes,
      receive: net.rx_bytes
    })),
    listeners: networkConnections.filter(c => c.state === 'LISTEN').map(lis => ({
      net_protocol: lis.protocol,
      address: lis.localAddress,
      port: lis.localPort,
      connections: networkConnections.filter(c => c.state === 'ESTABLISHED' && c.localPort === lis.localPort).map(con => ({
        local: con.localAddress + ':' + con.localPort,
        device: con.peerAddress + ':' + con.peerPort
      }))
    }))
  })
}

await loadStats()

setInterval(async () => {
  await loadStats()
  server.publish('updates', data)
}, 2500)

console.log(`scmonitor listening on ${server.hostname}:${server.port}`)
