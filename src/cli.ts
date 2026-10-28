#!/usr/bin/env node
import type { ResolvedConfig } from './index'
import { basename, join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { cancel, intro, isCancel, text } from '@clack/prompts'
import { compose, generate, installDaemon, loadConfig, readDashboardToken, runDaemon, serveDashboard, setup, tailscaleLinks, uninstallDaemon, up } from './index'
import { report, reportError, wantsJson } from './report'
import { selfUpgrade } from './upgrade'

const HELP = `Usage: dev-container <command>

Commands:
  setup [--yes]            Create the config, .env, .env.secret and .gitignore entries
  generate                 Write .dev-container/ (compose file, broker rules, resolved env files)
  up [compose up flags]    Generate, then \`docker compose up -d --build --remove-orphans\`
  compose <args...>        Run \`docker compose\` against the generated stack, e.g. \`compose logs -f agent\`
  serve [--host] [--port]  Serve the dashboard API and dashboard (token: $DEV_CONTAINER_DASHBOARD_TOKEN, dashboard.token or .dev-container/dashboard-token)
  upgrade [--force]        Pull the checkout, rebuild and restart when HEAD moved
  daemon run|install|uninstall  Serve the dashboard and, with selfUpgrade.auto, upgrade on a schedule
                           (install: launchd on macOS, a systemd user unit on Linux)

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
      const port = values.port ? Number(values.port) : config.dashboard.port
      const hostname = values.host ?? config.dashboard.host
      serveDashboard({ dir, token: readDashboardToken(dir, config.dashboard.token), hostname, port, links: tailscaleLinks(config) })
      process.stdout.write(`Dashboard API and dashboard on http://${hostname}:${port} (OpenAPI at /openapi.json, token in ${process.env.DEV_CONTAINER_DASHBOARD_TOKEN ? '$DEV_CONTAINER_DASHBOARD_TOKEN' : config.dashboard.token ? 'dashboard.token' : join(dir, 'dashboard-token')})\n`)
      return new Promise(() => {})
    }
    case 'upgrade': {
      const { values } = parseArgs({ args: rest, options: { force: { type: 'boolean' } } })
      const result = await selfUpgrade({ config, root, force: values.force, onWarnings: warnings => report(warnings, 'warning', json) })
      process.stdout.write(result === 'deployed' ? 'Deployed.\n' : 'Up to date.\n')
      return 0
    }
    case 'daemon':
      return runDaemonCommand(rest, { config, root, json })
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`)
      return 1
  }
}

// `--json` is ours anywhere except after `compose`, where it belongs to docker.
const args = process.argv.slice(2)
const end = args[0] === 'compose' ? 1 : args.length
const json = wantsJson(args.slice(0, end).includes('--json'))
async function runDaemonCommand(args: string[], { config, root, json }: { config: ResolvedConfig, root: string, json: boolean }): Promise<number> {
  const name = config.name ?? basename(root)
  const [action, ...rest] = args
  if (action === 'install') {
    process.stdout.write(`Installed ${installDaemon({ root, name })}\n`)
    return 0
  }
  if (action === 'uninstall') {
    uninstallDaemon(name)
    return 0
  }
  if (action !== 'run')
    throw new Error('Usage: dev-container daemon run|install|uninstall')
  const { values } = parseArgs({ args: rest, options: { host: { type: 'string' }, port: { type: 'string' } } })
  const port = values.port ? Number(values.port) : config.dashboard.port
  const host = values.host ?? config.dashboard.host
  runDaemon({ config, root, host, port, onWarnings: warnings => report(warnings, 'warning', json) })
  process.stdout.write(`Daemon on http://${host}:${port}${config.selfUpgrade.auto ? `, upgrading every ${config.selfUpgrade.interval}s` : ''}\n`)
  return new Promise(() => {})
}

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

  const { changes } = setup({ root: process.cwd(), image, ports })
  process.stdout.write(changes.length ? changes.map(change => `✔ ${change}\n`).join('') : 'Already set up; nothing changed.\n')
  process.stdout.write('\nNext: review dev-container.config.ts, then run `npx @antfu/dev-container up`.\n')
  return 0
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
