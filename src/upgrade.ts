import type { Diagnostic } from 'nostics'
import type { ResolvedConfig } from './config'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { up } from './docker'

export interface UpgradeOptions {
  config: ResolvedConfig
  /** The project root, which has to be a git checkout. */
  root: string
  /** Redeploy even when HEAD has not moved. */
  force?: boolean
  onWarnings?: (warnings: Diagnostic<unknown>[]) => void
}

/** Whether HEAD moved since the last good deploy. */
export function planUpgrade({ deployed, head, force = false }: { deployed?: string, head: string, force?: boolean }): boolean {
  return force || deployed !== head
}

const git = (root: string, args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

/**
 * Fast-forwards the checkout and its submodules, then redeploys only when HEAD moved since the last good
 * deploy. The `selfUpgrade.command` runs first, from the project root. A failure throws before the state is
 * written, so the next run retries and the previous containers keep running.
 */
export async function selfUpgrade({ config, root, force = false, onWarnings }: UpgradeOptions): Promise<'up-to-date' | 'deployed'> {
  const stateFile = join(root, '.dev-container', 'deployed')
  execFileSync('git', ['pull', '--ff-only'], { cwd: root, stdio: 'inherit' })
  if (existsSync(join(root, '.gitmodules')))
    execFileSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: root, stdio: 'inherit' })

  const head = git(root, ['rev-parse', 'HEAD'])
  const deployed = existsSync(stateFile) ? readFileSync(stateFile, 'utf8').trim() : undefined
  if (!planUpgrade({ deployed, head, force }))
    return 'up-to-date'

  for (const command of config.selfUpgrade.command)
    execFileSync('sh', ['-c', command], { cwd: root, stdio: 'inherit' })
  const code = await up({ config, root, onWarnings })
  if (code !== 0)
    throw new Error(`docker compose up exited with ${code}`)
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  writeFileSync(stateFile, `${head}\n`)
  return 'deployed'
}
