import type { Diagnostic } from 'nostics'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { loadConfig } from './config'
import { diagnostics } from './diagnostics'
import { up } from './docker'

export interface SyncOptions {
  /** Any directory inside the config repo. */
  cwd: string
  /** Docker CLI binary. Defaults to `docker`. */
  docker?: string
}

export interface StackSync {
  /** The stack's directory. */
  root: string
  status: 'unchanged' | 'updated' | 'failed'
  warnings: Diagnostic<unknown>[]
  /** Why the stack was not updated; it keeps running as it was. */
  error?: Error
}

export interface SyncResult {
  repo: string
  /** HEAD before and after the pull. */
  from: string
  to: string
  stacks: StackSync[]
}

const CONFIG_FILE = /(?:^|\/)dev-container\.config\.\w+$/

/**
 * Pulls the config repo (fast-forward only), then runs `up` for every stack
 * in it whose directory or env files changed since its last successful sync.
 * Node caches `.mjs` configs per process, so repeated runs belong in fresh processes.
 */
export async function sync({ cwd, docker }: SyncOptions): Promise<SyncResult> {
  const repo = repoRoot(cwd)
  if (git(repo, ['status', '--porcelain', '--untracked-files=no']))
    throw diagnostics.DEV_CONTAINER_G6002({ repo })

  const from = git(repo, ['rev-parse', 'HEAD'])
  try {
    git(repo, ['pull', '--ff-only'])
  }
  catch (error) {
    throw diagnostics.DEV_CONTAINER_G6003({ output: commandOutput(error), cause: error })
  }
  const to = git(repo, ['rev-parse', 'HEAD'])

  const stacks: StackSync[] = []
  for (const file of git(repo, ['ls-files', '-z']).split('\0').filter(file => CONFIG_FILE.test(file)))
    stacks.push(await syncStack(repo, dirname(file), docker))
  return { repo, from, to, stacks }
}

export function repoRoot(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel'])
  }
  catch (error) {
    throw diagnostics.DEV_CONTAINER_G6001({ cwd, output: commandOutput(error), cause: error })
  }
}

async function syncStack(repo: string, path: string, docker: string | undefined): Promise<StackSync> {
  const root = join(repo, path)
  const warnings: Diagnostic<unknown>[] = []
  try {
    const { config } = await loadConfig(root)
    // The tracked tree plus the host-only env files; `generate` itself can't be compared since it rotates placeholders.
    const hash = createHash('sha256').update(git(repo, ['rev-parse', `HEAD:${path === '.' ? '' : path}`]))
    for (const file of config.envFile) {
      const envPath = resolve(root, file)
      hash.update(`\0${file}\0`).update(existsSync(envPath) ? readFileSync(envPath) : '')
    }
    const fingerprint = hash.digest('hex')

    const state = join(root, '.dev-container', 'sync.json')
    if (existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).fingerprint === fingerprint)
      return { root, status: 'unchanged', warnings }

    const code = await up({ config, root, docker, onWarnings: found => warnings.push(...found) })
    if (code !== 0)
      return { root, status: 'failed', warnings, error: diagnostics.DEV_CONTAINER_G6004({ root, code }) }
    writeFileSync(state, `${JSON.stringify({ fingerprint })}\n`)
    return { root, status: 'updated', warnings }
  }
  catch (error) {
    return { root, status: 'failed', warnings, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

function git(cwd: string, args: string[]): string {
  // A background sync has no terminal to answer a credential prompt.
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim()
}

/** A failed child process's stderr, or its error message when it printed nothing. */
export function commandOutput(error: unknown): string {
  const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : ''
  return stderr || (error instanceof Error ? error.message : String(error))
}
