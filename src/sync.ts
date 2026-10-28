import type { Diagnostic } from 'nostics'
import type { ResolvedConfig } from './config'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { up } from './docker'

export interface SyncOptions {
  config: ResolvedConfig
  /** The project root, which has to be a git checkout. */
  root: string
  /** Redeploy even when HEAD has not moved. */
  force?: boolean
  onWarnings?: (warnings: Diagnostic<unknown>[]) => void
}

/** Whether HEAD moved since the last good deploy. */
export function planSync({ deployed, head, force = false }: { deployed?: string, head: string, force?: boolean }): boolean {
  return force || deployed !== head
}

const git = (root: string, args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

/**
 * Fast-forwards the checkout and its submodules, then redeploys only when HEAD moved since the last good
 * deploy. The `sync.commands` run first, from the project root. A failure throws before the state is
 * written, so the next run retries and the previous containers keep running.
 */
export async function sync({ config, root, force = false, onWarnings }: SyncOptions): Promise<'up-to-date' | 'deployed'> {
  const stateFile = join(root, '.dev-container', 'deployed')
  execFileSync('git', ['pull', '--ff-only'], { cwd: root, stdio: 'inherit' })
  if (existsSync(join(root, '.gitmodules')))
    execFileSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: root, stdio: 'inherit' })

  const head = git(root, ['rev-parse', 'HEAD'])
  const deployed = existsSync(stateFile) ? readFileSync(stateFile, 'utf8').trim() : undefined
  if (!planSync({ deployed, head, force }))
    return 'up-to-date'

  for (const command of config.sync.commands)
    execFileSync('sh', ['-c', command], { cwd: root, stdio: 'inherit' })
  const code = await up({ config, root, onWarnings })
  if (code !== 0)
    throw new Error(`docker compose up exited with ${code}`)
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  writeFileSync(stateFile, `${head}\n`)
  return 'deployed'
}

const labelOf = (name: string): string => `dev.dev-container.${name}.sync`
const plistPath = (name: string): string => join(homedir(), 'Library', 'LaunchAgents', `${labelOf(name)}.plist`)
const domain = (): string => `gui/${process.getuid?.() ?? 501}`
const quote = (value: string): string => `'${value.replaceAll(`'`, `'\\''`)}'`
const escapeXml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A launchd agent that runs `dev-container sync` every `interval` seconds, through a login shell for PATH. */
export function renderPlist({ name, root, interval, node, cli }: { name: string, root: string, interval: number, node: string, cli: string }): string {
  const log = escapeXml(join(root, '.dev-container', 'sync.log'))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(labelOf(name))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(`cd ${quote(root)} && ${quote(node)} ${quote(cli)} sync`)}</string>
  </array>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`
}

function requireMac(): void {
  if (process.platform !== 'darwin')
    throw new Error('autosync uses launchd and only works on macOS; run `dev-container sync` from cron or a systemd timer elsewhere.')
}

function unload(name: string): void {
  try {
    execFileSync('launchctl', ['bootout', `${domain()}/${labelOf(name)}`], { stdio: 'ignore' })
  }
  catch {
    // Not loaded yet, which is fine on a first install.
  }
}

/** Installs the launchd agent that keeps the checkout and the stack in sync. */
export function installAutosync({ config, root, name }: { config: ResolvedConfig, root: string, name: string }): string {
  requireMac()
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  unload(name)
  const file = plistPath(name)
  writeFileSync(file, renderPlist({ name, root, interval: config.sync.interval, node: process.execPath, cli: process.argv[1] ?? '' }))
  execFileSync('launchctl', ['bootstrap', domain(), file], { stdio: 'inherit' })
  return file
}

export function uninstallAutosync(name: string): void {
  requireMac()
  unload(name)
  rmSync(plistPath(name), { force: true })
}
