import type { SecretSourceConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { diagnostics } from './diagnostics'

export interface SecretLookup {
  root: string
  env: NodeJS.ProcessEnv
  /** Merged envFile values; later files win. */
  envFile: Record<string, string>
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path))
    throw diagnostics.DEV_CONTAINER_S2005({ path })
  const parsed = parseEnv(readFileSync(path, 'utf8'))
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => !!entry[1]))
}

/** The host environment wins over envFiles, as with dotenv. */
export function lookupEnv(lookup: SecretLookup, name: string): string | undefined {
  return lookup.env[name] || lookup.envFile[name] || undefined
}

/** Resolves a source to its value; `label` names the config field in diagnostics. */
export function resolveSource(source: SecretSourceConfig, lookup: SecretLookup, label: string): string {
  if ('env' in source) {
    const value = lookupEnv(lookup, source.env)
    if (!value)
      throw diagnostics.DEV_CONTAINER_S2001({ label, env: source.env })
    return value
  }
  let value: string
  try {
    value = execSync(source.command, { cwd: lookup.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  }
  catch (error) {
    throw diagnostics.DEV_CONTAINER_S2003({ label, command: source.command, reason: 'failed', cause: error })
  }
  if (!value)
    throw diagnostics.DEV_CONTAINER_S2003({ label, command: source.command, reason: 'printed nothing' })
  return value
}

/** Single quotes keep values literal in compose env files, so they cannot contain one. */
export function formatEnvFile(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => {
    if (/['\n\r]/.test(value))
      throw diagnostics.DEV_CONTAINER_S2004({ key })
    return `${key}='${value}'\n`
  }).join('')
}
