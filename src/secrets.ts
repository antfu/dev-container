import type { SecretSourceConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export interface SecretLookup {
  root: string
  env: NodeJS.ProcessEnv
  envFile: Record<string, string>
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path))
    throw new Error(`envFile not found: ${path}`)
  const parsed = parseEnv(readFileSync(path, 'utf8'))
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/** Resolves a source to its value; throws with a message naming the source when it is unavailable. */
export function resolveSource(source: SecretSourceConfig, lookup: SecretLookup): string {
  if ('env' in source) {
    const value = lookup.env[source.env] || lookup.envFile[source.env]
    if (!value)
      throw new Error(`$${source.env} is not set in the environment or envFile`)
    return value
  }
  let value: string
  try {
    value = execSync(source.command, { cwd: lookup.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
  }
  catch {
    throw new Error(`\`${source.command}\` failed`)
  }
  if (!value)
    throw new Error(`\`${source.command}\` printed nothing`)
  return value
}

/** Single quotes keep values literal in compose env files, so they cannot contain one. */
export function formatEnvFile(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => {
    if (/['\n\r]/.test(value))
      throw new Error(`The value of ${key} contains a single quote or newline, which env files cannot carry literally`)
    return `${key}='${value}'\n`
  }).join('')
}
