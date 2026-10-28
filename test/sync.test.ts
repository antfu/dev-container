import { describe, expect, it } from 'vitest'
import { planSync, renderPlist } from '../src/sync'

describe('sync', () => {
  it('deploys the first time, and whenever HEAD moved or it is forced', () => {
    expect(planSync({ head: 'a' })).toBe(true)
    expect(planSync({ deployed: 'a', head: 'b' })).toBe(true)
    expect(planSync({ deployed: 'a', head: 'a' })).toBe(false)
    expect(planSync({ deployed: 'a', head: 'a', force: true })).toBe(true)
  })

  it('renders a launchd agent that runs sync through a login shell', () => {
    const plist = renderPlist({ name: 'containers', root: `/Users/me/it's here`, interval: 300, node: '/usr/bin/node', cli: '/p/cli.mjs' })
    expect(plist).toContain('<string>dev.dev-container.containers.sync</string>')
    expect(plist).toContain(`cd '/Users/me/it'\\''s here' &amp;&amp; '/usr/bin/node' '/p/cli.mjs' sync`)
    expect(plist).toContain('<integer>300</integer>')
    expect(plist).toContain('/Users/me/it\'s here/.dev-container/sync.log')
  })
})
