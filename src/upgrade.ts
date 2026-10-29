import type { Diagnostic } from 'nostics'
import type { ResolvedConfig } from './config'
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { compose } from './docker'
import { generate } from './generate'

const execFileAsync = promisify(execFile)

/** The steps of an upgrade, in order. */
type UpgradePhase = 'pulling' | 'building' | 'restarting'

export interface UpgradeOptions {
  config: ResolvedConfig
  /** The project root, which has to be a git checkout. */
  root: string
  /** Redeploy even when HEAD has not moved. */
  force?: boolean
  onWarnings?: (warnings: Diagnostic<unknown>[]) => void
  /** Called as each step starts. */
  onPhase?: (phase: UpgradePhase) => void
}

/** Whether HEAD moved since the last good deploy. */
export function planUpgrade({ deployed, head, force = false }: { deployed?: string, head: string, force?: boolean }): boolean {
  return force || deployed !== head
}

const git = async (root: string, args: string[]): Promise<string> => (await execFileAsync('git', args, { cwd: root, encoding: 'utf8' })).stdout.trim()

/** Runs a command with its output in ours, without blocking the event loop, so a daemon keeps answering while it runs. */
function exec(file: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`${[file, ...args].join(' ')} exited with ${code}`)))
  })
}

/**
 * Fast-forwards the checkout and its submodules, then redeploys only when HEAD moved since the last good
 * deploy. The `selfUpgrade.command` runs first, from the project root, and the images build before any
 * container stops. A failure throws before the state is written, so the next run retries and the previous
 * containers keep running.
 */
export async function selfUpgrade({ config, root, force = false, onWarnings, onPhase }: UpgradeOptions): Promise<'up-to-date' | 'deployed'> {
  const stateFile = join(root, '.dev-container', 'deployed')
  onPhase?.('pulling')
  await exec('git', ['pull', '--ff-only'], root)
  if (existsSync(join(root, '.gitmodules'))) {
    await exec('git', [
      'submodule',
      'update',
      '--init',
      '--recursive',
    ], root)
  }

  const head = await git(root, ['rev-parse', 'HEAD'])
  const deployed = existsSync(stateFile)
    ? readFileSync(stateFile, 'utf8').trim()
    : undefined
  if (!planUpgrade({ deployed, head, force }))
    return 'up-to-date'

  onPhase?.('building')
  for (const command of config.selfUpgrade.command)
    await exec('sh', ['-c', command], root)
  const { dir, warnings } = generate({ config, root })
  onWarnings?.(warnings)
  await check(await compose(['build'], { dir }), 'docker compose build')

  onPhase?.('restarting')
  await check(await compose([
    'up',
    '-d',
    '--remove-orphans',
  ], { dir }), 'docker compose up')
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  writeFileSync(stateFile, `${head}\n`)
  return 'deployed'
}

function check(code: number, what: string): void {
  if (code !== 0)
    throw new Error(`${what} exited with ${code}`)
}

interface Commit {
  sha: string
  subject: string
}

interface PendingCommits {
  /** How many commits upstream has that the checkout lacks. */
  behind: number
  /** The newest of them, at most ten. */
  commits: Commit[]
}

/** Fetches, then lists what the checkout's upstream has beyond HEAD. Undefined when that cannot be told, such as offline or without an upstream. */
async function pendingCommits(root: string): Promise<PendingCommits | undefined> {
  try {
    await git(root, ['fetch', '--quiet'])
    const behind = Number(await git(root, [
      'rev-list',
      '--count',
      'HEAD..@{upstream}',
    ]))
    const log = await git(root, [
      'log',
      '-n10',
      '--format=%h%x09%s',
      'HEAD..@{upstream}',
    ])
    return {
      behind,
      commits: log
        ? log.split('\n').map((line) => {
            const [sha, ...subject] = line.split('\t')
            return {
              sha,
              subject: subject.join('\t'),
            }
          })
        : [],
    }
  }
  catch {
    return undefined
  }
}

/** Where an upgrade run stands: idle before the first, then a step, then how it ended. */
interface UpgradeRun {
  phase: 'idle' | UpgradePhase | 'deployed' | 'up-to-date' | 'failed'
  /** Why the run failed. */
  error?: string
}

interface UpgradeStatus extends Partial<PendingCommits> {
  run: UpgradeRun
}

/** What the dashboard drives: one upgrade at a time, started in the background and followed through `status`. */
export interface Upgrader {
  status: () => Promise<UpgradeStatus>
  /** Starts a forced upgrade; a run already in flight is joined. */
  start: () => void
}

/** How long a fetch answers the dashboard's polling before git is asked again. */
const CHECK_TTL = 60_000

export function createUpgrader({ config, root, onWarnings, onDeployed }: Omit<UpgradeOptions, 'force' | 'onPhase'> & { onDeployed?: () => void }): Upgrader {
  let run: UpgradeRun = { phase: 'idle' }
  let pending: { at: number, value: PendingCommits | undefined } | undefined
  let running = false

  return {
    async status() {
      if (running)
        return { ...pending?.value, run }
      if (!pending || Date.now() - pending.at > CHECK_TTL) {
        pending = {
          at: Date.now(),
          value: await pendingCommits(root),
        }
      }
      return { ...pending.value, run }
    },
    start() {
      if (running)
        return
      running = true
      run = { phase: 'pulling' }
      selfUpgrade({
        config,
        root,
        force: true,
        onWarnings,
        onPhase: (phase) => { run = { phase } },
      })
        .then((result) => {
          run = { phase: result }
          if (result === 'deployed')
            onDeployed?.()
        }, (error: unknown) => {
          run = {
            phase: 'failed',
            error: error instanceof Error
              ? error.message
              : String(error),
          }
          process.stderr.write(`Upgrade failed: ${run.error}\n`)
        })
        .finally(() => {
          running = false
          pending = undefined
        })
    },
  }
}
