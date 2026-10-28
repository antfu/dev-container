#!/usr/bin/env -S node --no-warnings
// Stands in for the docker CLI: canned output, and records each invocation to $FAKE_DOCKER_LOG.
import { appendFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const args = process.argv.slice(2)
const print = line => process.stdout.write(`${line}\n`)
appendFileSync(process.env.FAKE_DOCKER_LOG, `${args.join(' ')}\n`)
const [command, ...rest] = args[0] === 'compose' ? args.slice(3) : args
if (process.env.FAKE_DOCKER_FAIL && args.join(' ').includes(process.env.FAKE_DOCKER_FAIL))
  process.exit(1)

function forever(print) {
  writeFileSync(process.env.FAKE_DOCKER_PID, String(process.pid))
  let i = 0
  print(i++)
  setInterval(() => print(i++), 20)
}

const stat = name => JSON.stringify({ Name: name, CPUPerc: '1.50%', MemPerc: '2.25%', MemUsage: '10MiB / 1GiB', NetIO: '1kB / 2kB', BlockIO: '0B / 0B', PIDs: '7' })

if (command === 'ps') {
  print(JSON.stringify({ Service: 'broker', Name: 'p-broker-1', State: 'running', Health: 'healthy', Status: 'Up 1 minute (healthy)' }))
  print(JSON.stringify({ Service: 'agent', Name: 'p-agent-1', State: 'running', Health: '', Status: 'Up 1 minute' }))
  print(JSON.stringify({ Service: 'old', Name: 'p-old-1', State: 'exited', Health: '', Status: 'Exited (0)' }))
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
else if (command === 'logs') {
  print('first\nsecond')
}
else if (command === 'restart' && rest[0] === 'missing') {
  console.error('no such service: missing')
  process.exit(1)
}
