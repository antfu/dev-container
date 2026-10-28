import type { ServerType } from '@hono/node-server'
import type { Diagnostic } from 'nostics'
import type { ResolvedConfig } from './config'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { serveControl } from './control'
import { readControlToken } from './generate'
import { sync } from './sync'

export interface DaemonOptions {
  config: ResolvedConfig
  /** The project root, which has to be a git checkout. */
  root: string
  /** Overrides `control.host`. */
  host?: string
  /** Overrides `control.port`. */
  port?: number
  onWarnings?: (warnings: Diagnostic<unknown>[]) => void
  /** Called after a deploy so the process can exit and its supervisor start the new code. Defaults to `process.exit(0)`. */
  onUpgraded?: () => void
}

export interface Daemon {
  server: ServerType
  close: () => void
}

/**
 * Serves the control API and, with `sync.autoUpgrade`, runs `sync` on a timer. The monitor's upgrade button
 * runs it on demand. Runs never overlap. After a deploy the process exits, so launchd or systemd restart it
 * on the freshly pulled code.
 */
export function runDaemon({ config, root, host, port, onWarnings, onUpgraded = () => process.exit(0) }: DaemonOptions): Daemon {
  const dir = join(root, '.dev-container')
  let running: Promise<'up-to-date' | 'deployed'> | undefined

  const upgrade = (force: boolean): Promise<'up-to-date' | 'deployed'> => {
    // A second caller joins the run in flight.
    running ??= sync({ config, root, force, onWarnings })
      .then((result) => {
        if (result === 'deployed')
          setTimeout(onUpgraded, 500).unref()
        return result
      })
      .finally(() => {
        running = undefined
      })
    return running
  }

  const server = serveControl({
    dir,
    token: readControlToken(dir),
    hostname: host ?? config.control.host,
    port: port ?? config.control.port,
    upgrade: () => upgrade(true),
  })

  let timer: ReturnType<typeof setInterval> | undefined
  if (config.sync.autoUpgrade) {
    timer = setInterval(() => {
      upgrade(false).catch((error: unknown) => {
        process.stderr.write(`Upgrade failed, retrying in ${config.sync.interval}s: ${error instanceof Error ? error.message : String(error)}\n`)
      })
    }, config.sync.interval * 1000)
  }

  return { server, close: () => {
    clearInterval(timer)
    server.close()
  } }
}

const quote = (value: string): string => `'${value.replaceAll(`'`, `'\\''`)}'`
const escapeXml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const command = ({ root, node, cli }: { root: string, node: string, cli: string }): string => `cd ${quote(root)} && exec ${quote(node)} ${quote(cli)} daemon run`

const labelOf = (name: string): string => `dev.dev-container.${name}.daemon`
const plistPath = (name: string): string => join(homedir(), 'Library', 'LaunchAgents', `${labelOf(name)}.plist`)
const unitName = (name: string): string => `dev-container-${name}.service`
const unitPath = (name: string): string => join(homedir(), '.config', 'systemd', 'user', unitName(name))
const domain = (): string => `gui/${process.getuid?.() ?? 501}`

interface UnitInput { name: string, root: string, node: string, cli: string }

/** A launchd agent that keeps `dev-container daemon run` alive, through a login shell for PATH. */
export function renderPlist(input: UnitInput): string {
  const log = escapeXml(join(input.root, '.dev-container', 'daemon.log'))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(labelOf(input.name))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(command(input))}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`
}

/** A systemd user unit that keeps `dev-container daemon run` alive, through a login shell for PATH. */
export function renderSystemdUnit(input: UnitInput): string {
  const line = command(input).replaceAll('%', '%%').replaceAll('"', '\\"')
  return `[Unit]
Description=dev-container daemon for ${input.name}
After=network-online.target docker.service

[Service]
ExecStart=/bin/sh -lc "${line}"
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`
}

function unsupported(): never {
  throw new Error('The daemon installs as a launchd agent on macOS and a systemd user unit on Linux; run `dev-container daemon run` under your own supervisor elsewhere.')
}

function tryRun(file: string, args: string[]): void {
  try {
    execFileSync(file, args, { stdio: 'ignore' })
  }
  catch {
    // Not loaded yet, which is fine on a first install.
  }
}

/** Installs the daemon so it starts at login and restarts when it exits. Returns the unit file. */
export function installDaemon({ root, name }: { root: string, name: string }): string {
  const input = { name, root, node: process.execPath, cli: process.argv[1] ?? '' }
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  if (process.platform === 'darwin') {
    tryRun('launchctl', ['bootout', `${domain()}/${labelOf(name)}`])
    const file = plistPath(name)
    writeFileSync(file, renderPlist(input))
    execFileSync('launchctl', ['bootstrap', domain(), file], { stdio: 'inherit' })
    return file
  }
  if (process.platform === 'linux') {
    const file = unitPath(name)
    mkdirSync(join(homedir(), '.config', 'systemd', 'user'), { recursive: true })
    writeFileSync(file, renderSystemdUnit(input))
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' })
    execFileSync('systemctl', ['--user', 'enable', '--now', unitName(name)], { stdio: 'inherit' })
    return file
  }
  return unsupported()
}

export function uninstallDaemon(name: string): void {
  if (process.platform === 'darwin') {
    tryRun('launchctl', ['bootout', `${domain()}/${labelOf(name)}`])
    rmSync(plistPath(name), { force: true })
  }
  else if (process.platform === 'linux') {
    tryRun('systemctl', ['--user', 'disable', '--now', unitName(name)])
    rmSync(unitPath(name), { force: true })
    tryRun('systemctl', ['--user', 'daemon-reload'])
  }
  else {
    unsupported()
  }
}
