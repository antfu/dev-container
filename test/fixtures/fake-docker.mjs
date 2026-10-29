#!/usr/bin/env -S node --no-warnings
// Stands in for the docker CLI: canned output, and records each invocation to $FAKE_DOCKER_LOG.
import { appendFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
const print = line => process.stdout.write(`${line}\n`)
appendFileSync(process.env.FAKE_DOCKER_LOG, `${args.join(' ')}\n`)
const [command, ...rest] = args[0] === 'compose'
  ? args.slice(3)
  : args

function forever(print) {
  writeFileSync(process.env.FAKE_DOCKER_PID, String(process.pid))
  let i = 0
  print(i++)
  setInterval(() => print(i++), 20)
}

function stat(name) {
  return JSON.stringify({
    Name: name,
    CPUPerc: '1.50%',
    MemPerc: '2.25%',
    MemUsage: '10MiB / 1GiB',
    NetIO: '1kB / 2kB',
    BlockIO: '0B / 0B',
    PIDs: '7',
  })
}

if (command === 'ps') {
  print(JSON.stringify({
    Service: 'broker',
    Name: 'p-broker-1',
    State: 'running',
    Health: 'healthy',
    Status: 'Up 1 minute (healthy)',
  }))
  print(JSON.stringify({
    Service: 'agent',
    Name: 'p-agent-1',
    State: 'running',
    Health: '',
    Status: 'Up 1 minute',
  }))
  print(JSON.stringify({
    Service: 'old',
    Name: 'p-old-1',
    State: 'exited',
    Health: '',
    Status: 'Exited (0)',
  }))
}
else if (command === 'stats' && rest[0] === '--no-stream') {
  rest.slice(3).forEach(name => print(stat(name)))
}
else if (command === 'stats') {
  forever(() => rest.slice(2).forEach(name => process.stdout.write(`\u001B[2J\u001B[H${stat(name)}\n`)))
}
else if (command === 'logs' && rest.includes('--follow')) {
  forever(i => print(`line ${i}`))
}
else if (command === 'logs' && rest.includes('broker')) {
  print('2026-10-29T09:00:00.000000000Z {"event":"ready","policy":"allowlist"}')
  print('2026-10-29T09:00:01.000000000Z {"event":"request","client":"172.20.0.5","scheme":"https","host":"api.github.com","port":443,"method":"GET","path":"/user","status":200,"injected":["GITHUB_TOKEN"]}')
  print('2026-10-29T09:00:02.000000000Z {"event":"block","client":"172.20.0.5","scheme":"https","host":"evil.example","port":443,"method":"CONNECT","path":"","code":"DEV_CONTAINER_B5001","why":"Host evil.example is not on the egress allowlist."}')
  print('2026-10-29T09:00:03.000000000Z not json')
}
else if (command === 'inspect') {
  print(JSON.stringify(rest.map((name, i) => ({
    Name: `/${name}`,
    NetworkSettings: {
      Networks: {
        caged: { IPAddress: `172.20.0.${i + 4}` },
      },
    },
  }))))
}
else if (command === 'logs') {
  print('first\nsecond')
}
else if (command === 'restart' && rest[0] === 'missing') {
  console.error('no such service: missing')
  process.exit(1)
}
