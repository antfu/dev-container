#!/usr/bin/env node
import { join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { loadConfig } from './config'
import { serveControl } from './control'
import { compose, up } from './docker'
import { generate, readControlToken } from './generate'

const HELP = `Usage: dev-container <command>

Commands:
  generate                 Write .dev-container/ (compose file, broker rules, resolved env files)
  up [compose up flags]    Generate, then \`docker compose up -d --build --remove-orphans\`
  compose <args...>        Run \`docker compose\` against the generated stack, e.g. \`compose logs -f agent\`
  serve [--host] [--port]  Serve the control API (token in .dev-container/control-token)
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

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  },
)
