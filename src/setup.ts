import type { Diagnostic } from 'nostics'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { diagnostics } from './diagnostics'

export interface SetupOptions {
  root: string
  /** Image of the starter `agent` service. */
  image?: string
  /** Ports the starter service publishes, e.g. `['3000', '5170-5180']`. */
  ports?: string[]
  /** gh CLI binary used to prefill GH_TOKEN. Defaults to `gh`. */
  gh?: string
}

export interface SetupResult {
  /** One line per file created or changed. */
  changes: string[]
  warnings: Diagnostic<unknown>[]
}

const IGNORED = ['.env', '.env.secret', '.dev-container/']

/**
 * Bootstraps a project: starter config, `.env`, `.env.secret` and `.gitignore`
 * entries. Idempotent: existing files and values are kept, only gaps are filled.
 */
export function setup({ root, image = 'node:24', ports = [], gh = 'gh' }: SetupOptions): SetupResult {
  const changes: string[] = []
  const warnings: Diagnostic<unknown>[] = []

  if (!readdirSync(root).some(file => file.startsWith('dev-container.config.'))) {
    writeFileSync(join(root, 'dev-container.config.ts'), starterConfig(image, ports))
    changes.push('created dev-container.config.ts')
  }

  if (!existsSync(join(root, '.env'))) {
    writeFileSync(join(root, '.env'), '# Settings read by `{ env: \'NAME\' }` sources in dev-container.config.ts.\n')
    changes.push('created .env')
  }

  fillSecrets(join(root, '.env.secret'), gh, changes, warnings)
  ignore(join(root, '.gitignore'), changes)
  return { changes, warnings }
}

function fillSecrets(file: string, gh: string, changes: string[], warnings: Diagnostic<unknown>[]): void {
  const existed = existsSync(file)
  const before = existed ? readFileSync(file, 'utf8') : '# Brokered: the container only ever sees placeholders for these.\n'
  let secrets = before
  if (!hasValue(secrets, 'GH_TOKEN')) {
    const token = ghToken(gh, warnings)
    secrets = token ? setValue(secrets, 'GH_TOKEN', token) : ensureKey(secrets, 'GH_TOKEN')
    if (token)
      changes.push('filled GH_TOKEN in .env.secret from `gh auth token`')
  }
  secrets = ensureKey(secrets, 'NPM_TOKEN')
  if (!existed || secrets !== before) {
    writeFileSync(file, secrets, { mode: 0o600 })
    changes.push(`${existed ? 'updated' : 'created'} .env.secret`)
  }
  chmodSync(file, 0o600)
}

function ignore(file: string, changes: string[]): void {
  const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const lines = new Set(content.split(/\r?\n/).map(line => line.trim().replace(/^\//, '').replace(/\/$/, '')))
  const missing = IGNORED.filter(entry => !lines.has(entry.replace(/\/$/, '')))
  if (!missing.length)
    return
  writeFileSync(file, `${content}${content && !content.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`)
  changes.push(`added ${missing.join(', ')} to .gitignore`)
}

function ghToken(gh: string, warnings: Diagnostic<unknown>[]): string | undefined {
  try {
    const token = execFileSync(gh, ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }).trim()
    if (token)
      return token
    warnings.push(diagnostics.DEV_CONTAINER_S2006({ reason: 'printed no token' }))
  }
  catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    warnings.push(diagnostics.DEV_CONTAINER_S2006({ reason: missing ? 'is not installed' : 'is not logged in', cause: error }))
  }
}

function hasValue(file: string, key: string): boolean {
  return new RegExp(`^${key}=\\S`, 'm').test(file)
}

function ensureKey(file: string, key: string): string {
  return new RegExp(`^${key}=`, 'm').test(file) ? file : `${file}${key}=\n`
}

function setValue(file: string, key: string, value: string): string {
  const line = new RegExp(`^${key}=.*$`, 'm')
  return line.test(file) ? file.replace(line, `${key}=${value}`) : `${file}${key}=${value}\n`
}

function starterConfig(image: string, ports: string[]): string {
  const portList = ports.map(port => /^\d+$/.test(port) ? port : `'${port}'`).join(', ')
  return `import type { UserConfig } from 'dev-container'

// GH_TOKEN and NPM_TOKEN from .env.secret are brokered: the container only sees placeholders.
// Reference: https://github.com/antfu/dev-container#config
// Examples (Paseo, opencode, pi, Claude Code): https://github.com/antfu/dev-container/tree/main/examples
export default {
  envFile: ['.env', '.env.secret'],
  services: {
    agent: {
      image: '${image}',
      command: ['sleep', 'infinity'],
      volumes: ['./:/workspace'],
      persist: ['/root'],${portList ? `\n      ports: [${portList}],` : ''}
    },
  },
} satisfies UserConfig
`
}
