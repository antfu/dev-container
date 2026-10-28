import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { diagnostics } from './diagnostics'
import { commandOutput, repoRoot } from './sync'

export interface SyncServiceOptions {
  /** Any directory inside the config repo. */
  cwd: string
  /** Defaults to `process.platform`; `linux` (systemd) and `darwin` (launchd) are supported. */
  platform?: NodeJS.Platform
  /** Defaults to the user's home directory. */
  home?: string
  /** `systemctl` on Linux, `launchctl` on macOS. */
  scheduler?: string
}

export interface InstallSyncServiceOptions extends SyncServiceOptions {
  /** The CLI to run, e.g. `[process.execPath, '/path/to/dev-container/dist/cli.mjs']`. */
  command: string[]
  /** Seconds between syncs. */
  interval: number
}

export interface SyncService {
  name: string
  /** The unit or plist file. */
  file: string
  /** The command (systemd) or file (launchd) that shows the service's output. */
  logs: string
}

/** Installs and starts a user service that runs `sync --watch` in the repo, and keeps it running across logins and crashes. */
export function installSyncService(options: InstallSyncServiceOptions): SyncService {
  const service = describeService(options)
  const argv = [...options.command, 'sync', '--watch', '--interval', String(options.interval)]
  mkdirSync(dirname(service.file), { recursive: true })
  if (service.platform === 'linux') {
    writeFileSync(service.file, systemdUnit(service.repo, argv))
    run(service.scheduler, ['--user', 'daemon-reload'])
    run(service.scheduler, ['--user', 'enable', `${service.name}.service`])
    run(service.scheduler, ['--user', 'restart', `${service.name}.service`])
  }
  else {
    writeFileSync(service.file, launchdPlist(service.name, service.repo, argv, service.logs))
    stopLaunchd(service.scheduler, service.name)
    run(service.scheduler, ['bootstrap', `gui/${process.getuid?.()}`, service.file])
  }
  return { name: service.name, file: service.file, logs: service.logs }
}

/** Stops and removes the service installed for the repo. */
export function uninstallSyncService(options: SyncServiceOptions): SyncService {
  const service = describeService(options)
  if (service.platform === 'linux') {
    tryRun(service.scheduler, ['--user', 'disable', '--now', `${service.name}.service`])
    rmSync(service.file, { force: true })
    run(service.scheduler, ['--user', 'daemon-reload'])
  }
  else {
    stopLaunchd(service.scheduler, service.name)
    rmSync(service.file, { force: true })
  }
  return { name: service.name, file: service.file, logs: service.logs }
}

interface ServiceTarget extends SyncService {
  platform: 'linux' | 'darwin'
  repo: string
  scheduler: string
}

function describeService({ cwd, platform = process.platform, home = homedir(), scheduler }: SyncServiceOptions): ServiceTarget {
  const repo = repoRoot(cwd)
  const slug = basename(repo).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  if (platform === 'linux') {
    const name = `dev-container-sync-${slug}`
    return { platform, repo, name, scheduler: scheduler ?? 'systemctl', file: join(home, '.config/systemd/user', `${name}.service`), logs: `journalctl --user -u ${name} -f` }
  }
  if (platform === 'darwin') {
    const name = `dev.antfu.dev-container-sync.${slug}`
    return { platform, repo, name, scheduler: scheduler ?? 'launchctl', file: join(home, 'Library/LaunchAgents', `${name}.plist`), logs: join(home, 'Library/Logs', `${name}.log`) }
  }
  throw diagnostics.DEV_CONTAINER_G6005({ platform })
}

/** `PATH` is carried over so the service finds the same `git` and `docker` as the shell that installed it. */
function systemdUnit(repo: string, argv: string[]): string {
  const quote = (value: string): string => `"${value.replace(/[\\"]/g, '\\$&').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`
  return `[Unit]
Description=dev-container sync for ${repo.replace(/%/g, '%%')}
After=network-online.target

[Service]
WorkingDirectory=${quote(repo)}
Environment=${quote(`PATH=${process.env.PATH ?? ''}`)}
ExecStart=${argv.map(quote).join(' ')}
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
`
}

function launchdPlist(label: string, repo: string, argv: string[], log: string): string {
  const string = (value: string): string => `<string>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  ${string(label)}
  <key>ProgramArguments</key>
  <array>
    ${argv.map(string).join('\n    ')}
  </array>
  <key>WorkingDirectory</key>
  ${string(repo)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    ${string(process.env.PATH ?? '')}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  ${string(log)}
  <key>StandardErrorPath</key>
  ${string(log)}
</dict>
</plist>
`
}

/** Unloading a service that isn't loaded fails; that's the state we want anyway. */
function stopLaunchd(launchctl: string, label: string): void {
  tryRun(launchctl, ['bootout', `gui/${process.getuid?.()}/${label}`])
}

function run(command: string, args: string[]): void {
  try {
    execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
  catch (error) {
    throw diagnostics.DEV_CONTAINER_G6006({ command: [command, ...args].join(' '), output: commandOutput(error), cause: error })
  }
}

function tryRun(command: string, args: string[]): void {
  try {
    run(command, args)
  }
  catch {}
}
