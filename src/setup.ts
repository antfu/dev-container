import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SetupOptions {
  root: string
  /** Image of the starter `agent` service. */
  image?: string
  /** Ports the starter service publishes, e.g. `['3000', '5170-5180']`. */
  ports?: string[]
}

export interface SetupResult {
  /** One line per file created or changed. */
  changes: string[]
}

const IGNORED = ['.env', '.env.secret', '.dev-container/']

/**
 * Bootstraps a project: starter config, `.env`, `.env.secret` and `.gitignore`
 * entries. Idempotent: existing files and values are kept, only gaps are filled.
 */
export function setup({ root, image = 'node:24', ports = [] }: SetupOptions): SetupResult {
  const changes: string[] = []

  if (!readdirSync(root).some(file => file.startsWith('dev-container.config.'))) {
    writeFileSync(join(root, 'dev-container.config.ts'), starterConfig(image, ports))
    changes.push('created dev-container.config.ts')
  }

  if (!existsSync(join(root, '.env'))) {
    writeFileSync(join(root, '.env'), '# Settings read by `{ env: \'NAME\' }` sources in dev-container.config.ts.\n')
    changes.push('created .env')
  }

  fillSecrets(join(root, '.env.secret'), changes)
  ignore(join(root, '.gitignore'), changes)
  return { changes }
}

function fillSecrets(file: string, changes: string[]): void {
  const existed = existsSync(file)
  const before = existed
    ? readFileSync(file, 'utf8')
    : '# Brokered: the container only ever sees placeholders for these.\n'
  const secrets = ensureKey(ensureKey(before, 'GITHUB_TOKEN'), 'NPM_TOKEN')
  if (!existed || secrets !== before) {
    writeFileSync(file, secrets, { mode: 0o600 })
    changes.push(`${existed ? 'updated' : 'created'} .env.secret`)
  }
  chmodSync(file, 0o600)
}

function ignore(file: string, changes: string[]): void {
  const content = existsSync(file)
    ? readFileSync(file, 'utf8')
    : ''
  const lines = new Set(content.split(/\r?\n/).map(line => line.trim().replace(/^\//, '').replace(/\/$/, '')))
  const missing = IGNORED.filter(entry => !lines.has(entry.replace(/\/$/, '')))
  if (!missing.length)
    return
  writeFileSync(file, `${content}${content && !content.endsWith('\n')
    ? '\n'
    : ''}${missing.join('\n')}\n`)
  changes.push(`added ${missing.join(', ')} to .gitignore`)
}

function ensureKey(file: string, key: string): string {
  return new RegExp(`^${key}=`, 'm').test(file)
    ? file
    : `${file}${key}=\n`
}

function starterConfig(image: string, ports: string[]): string {
  const portList = ports.map(port => /^\d+$/.test(port)
    ? port
    : `'${port}'`).join(', ')
  return `import type { UserConfig } from '@antfu/dev-container'

// GITHUB_TOKEN and NPM_TOKEN from .env.secret are brokered: the container only sees placeholders.
// Reference: https://github.com/antfu/dev-container#config
// Examples (Paseo, opencode, pi, Claude Code): https://github.com/antfu/dev-container/tree/main/examples
export default {
  services: {
    agent: {
      image: '${image}',
      command: ['sleep', 'infinity'],
      volumes: ['./:/workspace'],
      persist: ['/root'],${portList
        ? `\n      ports: [${portList}],`
        : ''}
    },
  },
} satisfies UserConfig
`
}
