import { describe, expect, it } from 'vitest'
import { renderPlist, renderSystemdUnit } from '../src/daemon'

const input = { name: 'containers', root: `/Users/me/it's here`, node: '/usr/bin/node', cli: '/p/cli.mjs' }

describe('daemon', () => {
  it('renders a launchd agent that keeps the daemon alive through a login shell', () => {
    const plist = renderPlist(input)
    expect(plist).toContain('<string>dev.dev-container.containers.daemon</string>')
    expect(plist).toContain(`cd '/Users/me/it'\\''s here' &amp;&amp; exec '/usr/bin/node' '/p/cli.mjs' daemon run`)
    expect(plist).toContain('<key>KeepAlive</key>')
    expect(plist).toContain(`/Users/me/it's here/.dev-container/daemon.log`)
  })

  it('renders a systemd user unit that restarts the daemon', () => {
    const unit = renderSystemdUnit(input)
    expect(unit).toContain(`ExecStart=/bin/sh -lc "cd '/Users/me/it'\\''s here' && exec '/usr/bin/node' '/p/cli.mjs' daemon run"`)
    expect(unit).toContain('Restart=always')
    expect(unit).toContain('WantedBy=default.target')
  })
})
