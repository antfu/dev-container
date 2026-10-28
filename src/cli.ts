#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { cancel, intro, isCancel, text } from '@clack/prompts'
import { compose, generate, installSyncService, loadConfig, readControlToken, serveControl, setup, sync, uninstallSyncService, up } from './index'
import { report, reportError, wantsJson } from './report'

const HELP = `Usage: dev-container <command>

Commands:
  setup [--yes]            Create the config, .env, .env.secret (GH_TOKEN from \`gh auth token\`) and .gitignore entries
  generate                 Write .dev-container/ (compose file, broker rules, resolved env files)
  up [compose up flags]    Generate, then \`docker compose up -d --build --remove-orphans\`
  compose <args...>        Run \`docker compose\` against the generated stack, e.g. \`compose logs -f agent\`
  serve [--host] [--port]  Serve the control API (token in .dev-container/control-token)
  sync [--watch]           Pull the config repo and \`up\` every stack in it that changed
       [--interval <s>]    Seconds between syncs with --watch or --install (default 900)
       [--install]         Install a user service (systemd or launchd) running \`sync --watch\` here
       [--uninstall]       Remove that service

Errors are printed as diagnostics with a code, a fix and a docs link. Pass --json
(or set DEV_CONTAINER_JSON=1) for one JSON object per diagnostic on stderr; this is
the default when an AI agent runs the CLI.
`

async function main(argv: string[], json: boolean): Promise<number> {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }

  if (command === 'setup')
    return runSetup(rest, json)
  if (command === 'sync')
    return runSync(rest, json)

  const { config, root } = await loadConfig()
  const dir = join(root, '.dev-container')

  switch (command) {
    case 'generate': {
      const { composeFile, warnings } = generate({ config, root })
      report(warnings, 'warning', json)
      process.stdout.write(`Generated ${composeFile}\n`)
      return 0
    }
    case 'up':
      return up({ config, root, args: rest, onWarnings: warnings => report(warnings, 'warning', json) })
    case 'compose':
      return compose(rest, { dir })
    case 'serve': {
      const { values } = parseArgs({ args: rest, options: { host: { type: 'string' }, port: { type: 'string' } } })
      const port = values.port ? Number(values.port) : config.control.port
      const hostname = values.host ?? '127.0.0.1'
      serveControl({ dir, token: readControlToken(dir), hostname, port })
      process.stdout.write(`Control API on http://${hostname}:${port} (OpenAPI at /openapi.json, token in ${join(dir, 'control-token')})\n`)
      return new Promise(() => {})
    }
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`)
      return 1
  }
}

// `--json` is ours anywhere except after `compose`, where it belongs to docker.
const args = process.argv.slice(2)
const end = args[0] === 'compose' ? 1 : args.length
const json = wantsJson(args.slice(0, end).includes('--json'))
const PORTS = /^\s*(?:\d+(?:-\d+)?\s*(?:,\s*|$))*$/

async function runSetup(args: string[], json: boolean): Promise<number> {
  const { values } = parseArgs({ args, options: { yes: { type: 'boolean', short: 'y' } } })
  let image: string | undefined
  let ports: string[] = []
  // Agents and scripts get the defaults; people at a terminal get asked.
  if (!values.yes && !json && process.stdin.isTTY && process.stdout.isTTY) {
    intro('dev-container setup')
    const imageAnswer = await text({
      message: 'Image for the agent service',
      placeholder: 'node:24',
      defaultValue: 'node:24',
      validate: value => value && /[\s'"]/.test(value) ? 'An image reference has no spaces or quotes' : undefined,
    })
    if (isCancel(imageAnswer))
      return cancelled()
    const portsAnswer = await text({
      message: 'Ports to publish on 127.0.0.1 (comma-separated, optional)',
      placeholder: '3000, 5170-5180',
      defaultValue: '',
      validate: value => value && !PORTS.test(value) ? 'Use ports or ranges like 3000, 5170-5180' : undefined,
    })
    if (isCancel(portsAnswer))
      return cancelled()
    image = imageAnswer
    ports = portsAnswer.split(',').map(port => port.trim()).filter(Boolean)
  }

  const { changes, warnings } = setup({ root: process.cwd(), image, ports })
  report(warnings, 'warning', json)
  process.stdout.write(changes.length ? changes.map(change => `✔ ${change}\n`).join('') : 'Already set up; nothing changed.\n')
  process.stdout.write('\nNext: review dev-container.config.ts, then run `npx @antfu/dev-container up`.\n')
  return 0
}

async function runSync(args: string[], json: boolean): Promise<number> {
  const { values } = parseArgs({ args, options: { watch: { type: 'boolean' }, interval: { type: 'string', default: '900' }, install: { type: 'boolean' }, uninstall: { type: 'boolean' } } })
  const interval = Number(values.interval)
  if (!Number.isInteger(interval) || interval < 1) {
    process.stderr.write(`--interval must be a whole number of seconds, got ${values.interval}\n`)
    return 1
  }
  const cwd = process.cwd()

  if (values.install) {
    // The bin on PATH is a symlink; the service should run the file it points at.
    const service = installSyncService({ cwd, interval, command: [process.execPath, realpathSync(process.argv[1]!)] })
    process.stdout.write(`✔ installed and started ${service.name} (${service.file}), syncing every ${interval}s\nLogs: ${service.logs}\n`)
    if (process.platform === 'linux')
      process.stdout.write('To keep it running while you are logged out, run `loginctl enable-linger`.\n')
    return 0
  }
  if (values.uninstall) {
    const service = uninstallSyncService({ cwd })
    process.stdout.write(`✔ removed ${service.name}\n`)
    return 0
  }

  if (!values.watch)
    return syncOnce(cwd, json)
  for (;;) {
    process.stdout.write(`[${new Date().toISOString()}] sync\n`)
    // A fresh process per run: Node caches imported `.mjs` configs for the life of a process.
    await new Promise(resolve => spawn(process.execPath, [...process.execArgv, process.argv[1]!, 'sync', ...json ? ['--json'] : []], { stdio: 'inherit' }).on('close', resolve))
    await sleep(interval * 1000)
  }
}

async function syncOnce(cwd: string, json: boolean): Promise<number> {
  try {
    const { repo, from, to, stacks } = await sync({ cwd })
    process.stdout.write(from === to ? 'Already up to date.\n' : `Pulled ${from.slice(0, 7)}..${to.slice(0, 7)}\n`)
    const marks = { unchanged: '·', updated: '✔', failed: '✖' }
    for (const stack of stacks) {
      report(stack.warnings, 'warning', json)
      if (stack.error)
        reportError(stack.error, json)
      process.stdout.write(`${marks[stack.status]} ${stack.status} ${relative(repo, stack.root) || '.'}\n`)
    }
    return stacks.some(stack => stack.status === 'failed') ? 1 : 0
  }
  catch (error) {
    reportError(error, json)
    return 1
  }
}

function cancelled(): number {
  cancel('Setup cancelled; nothing was written.')
  return 1
}

main(args.filter((arg, i) => i >= end || arg !== '--json'), json).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    reportError(error, json)
    process.exitCode = 1
  },
)
