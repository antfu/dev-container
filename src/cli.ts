#!/usr/bin/env node
import { join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { loadConfig } from './config'
import { serveControl } from './control'
import { compose, up } from './docker'
import { generate, readControlToken } from './generate'
import { reportError, wantsJson } from './report'

const HELP = `Usage: dev-container <command>

Commands:
  generate                 Write .dev-container/ (compose file, broker rules, resolved env files)
  up [compose up flags]    Generate, then \`docker compose up -d --build --remove-orphans\`
  compose <args...>        Run \`docker compose\` against the generated stack, e.g. \`compose logs -f agent\`
  serve [--host] [--port]  Serve the control API (token in .dev-container/control-token)

Errors are printed as diagnostics with a code, a fix and a docs link. Pass --json
(or set DEV_CONTAINER_JSON=1) for one JSON object per diagnostic on stderr; this is
the default when an AI agent runs the CLI.
`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }

  const { config, root } = await loadConfig()
  const dir = join(root, '.dev-container')

  switch (command) {
    case 'generate': {
      const { composeFile } = generate({ config, root })
      process.stdout.write(`Generated ${composeFile}\n`)
      return 0
    }
    case 'up':
      return up({ config, root, args: rest })
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
main(args.filter((arg, i) => i >= end || arg !== '--json')).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    reportError(error, json)
    process.exitCode = 1
  },
)
