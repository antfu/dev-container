import type { ServerType } from '@hono/node-server'
import type { Diagnostic } from 'nostics'
import type { ResolvedConfig } from './config'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { tailscaleLinks } from './compose'
import { serveDashboard } from './dashboard'
import { readDashboardToken } from './generate'
import { createUpgrader } from './upgrade'

export interface DaemonOptions {
  config: ResolvedConfig
  /** The project root, which has to be a git checkout. */
  root: string
  /** Overrides `dashboard.host`. */
  host?: string
  /** Overrides `dashboard.port`. */
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
 * Serves the dashboard API. Its upgrade button runs `selfUpgrade` on demand, one run at a time. After a
 * deploy the process exits, so launchd or systemd restart it on the freshly pulled code.
 */
export function runDaemon({ config, root, host, port, onWarnings, onUpgraded = () => process.exit(0) }: DaemonOptions): Daemon {
  const dir = join(root, '.dev-container')
  const server = serveDashboard({
    dir,
    token: readDashboardToken(dir, config.dashboard.token),
    links: tailscaleLinks(config),
    hostname: host ?? config.dashboard.host,
    port: port ?? config.dashboard.port,
    // The delay lets the page see the run finish before the server goes away.
    upgrade: createUpgrader({
      config,
      root,
      onWarnings,
      onDeployed: () => setTimeout(onUpgraded, 2000).unref(),
    }),
  })
  return {
    server,
    close: () => server.close(),
  }
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
  const input = {
    name,
    root,
    node: process.execPath,
    cli: process.argv[1] ?? '',
  }
  mkdirSync(join(root, '.dev-container'), { recursive: true })
  if (process.platform === 'darwin') {
    tryRun('launchctl', ['bootout', `${domain()}/${labelOf(name)}`])
    const file = plistPath(name)
    writeFileSync(file, renderPlist(input))
    execFileSync('launchctl', [
      'bootstrap',
      domain(),
      file,
    ], { stdio: 'inherit' })
    return file
  }
  if (process.platform === 'linux') {
    const file = unitPath(name)
    mkdirSync(join(homedir(), '.config', 'systemd', 'user'), { recursive: true })
    writeFileSync(file, renderSystemdUnit(input))
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' })
    execFileSync('systemctl', [
      '--user',
      'enable',
      '--now',
      unitName(name),
    ], { stdio: 'inherit' })
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
    tryRun('systemctl', [
      '--user',
      'disable',
      '--now',
      unitName(name),
    ])
    rmSync(unitPath(name), { force: true })
    tryRun('systemctl', ['--user', 'daemon-reload'])
  }
  else {
    unsupported()
  }
}
