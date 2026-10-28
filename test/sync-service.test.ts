import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { installSyncService, uninstallSyncService } from '../src'

let tmp: string
let repo: string
let scheduler: string
const calls = () => readFileSync(join(tmp, 'calls'), 'utf8').trim().split('\n')

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-service-')))
  repo = join(tmp, 'My Configs')
  mkdirSync(repo)
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
  scheduler = join(tmp, 'scheduler')
  writeFileSync(scheduler, `#!/bin/sh\necho "$@" >> '${tmp}/calls'\n`, { mode: 0o755 })
})

describe('sync service', () => {
  it('installs a systemd user service that keeps `sync --watch` running in the repo', () => {
    const service = installSyncService({ cwd: repo, interval: 60, command: ['/usr/bin/node', '/opt/dev-container/cli.mjs'], platform: 'linux', home: tmp, scheduler })
    expect(service).toEqual({
      name: 'dev-container-sync-my-configs',
      file: join(tmp, '.config/systemd/user/dev-container-sync-my-configs.service'),
      logs: 'journalctl --user -u dev-container-sync-my-configs -f',
    })
    const unit = readFileSync(service.file, 'utf8')
    expect(unit).toContain(`WorkingDirectory="${repo}"\n`)
    expect(unit).toContain('ExecStart="/usr/bin/node" "/opt/dev-container/cli.mjs" "sync" "--watch" "--interval" "60"\n')
    expect(unit).toContain('Restart=always\n')
    expect(calls()).toEqual(['--user daemon-reload', '--user enable dev-container-sync-my-configs.service', '--user restart dev-container-sync-my-configs.service'])

    uninstallSyncService({ cwd: repo, platform: 'linux', home: tmp, scheduler })
    expect(existsSync(service.file)).toBe(false)
    expect(calls().slice(3)).toEqual(['--user disable --now dev-container-sync-my-configs.service', '--user daemon-reload'])
  })

  it('installs a launchd agent on macOS', () => {
    const service = installSyncService({ cwd: repo, interval: 900, command: ['/usr/local/bin/node', '/opt/a&b/cli.mjs'], platform: 'darwin', home: tmp, scheduler })
    expect(service.file).toBe(join(tmp, 'Library/LaunchAgents/dev.antfu.dev-container-sync.my-configs.plist'))
    expect(service.logs).toBe(join(tmp, 'Library/Logs/dev.antfu.dev-container-sync.my-configs.log'))
    const plist = readFileSync(service.file, 'utf8')
    expect(plist).toContain('<string>/opt/a&amp;b/cli.mjs</string>\n    <string>sync</string>\n    <string>--watch</string>\n    <string>--interval</string>\n    <string>900</string>')
    expect(plist).toContain(`<key>WorkingDirectory</key>\n  <string>${repo}</string>`)
    expect(plist).toContain('<key>KeepAlive</key>\n  <true/>')
    expect(calls()).toEqual([`bootout gui/${process.getuid!()}/dev.antfu.dev-container-sync.my-configs`, `bootstrap gui/${process.getuid!()} ${service.file}`])
  })

  it('reports platforms without a service manager it knows', () => {
    expect(() => installSyncService({ cwd: repo, interval: 60, command: ['node'], platform: 'win32', home: tmp, scheduler }))
      .toThrow(expect.objectContaining({ name: 'DEV_CONTAINER_G6005' }))
  })

  it('reports a failing service manager', () => {
    writeFileSync(scheduler, '#!/bin/sh\necho "Failed to connect to bus" >&2\nexit 1\n')
    expect(() => installSyncService({ cwd: repo, interval: 60, command: ['node'], platform: 'linux', home: tmp, scheduler }))
      .toThrow(expect.objectContaining({ name: 'DEV_CONTAINER_G6006', message: `\`${scheduler} --user daemon-reload\` failed: Failed to connect to bus` }))
  })
})
