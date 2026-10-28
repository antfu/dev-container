import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generate, loadConfig, setup } from '../src'

function fakeGh(script: string) {
  const path = join(mkdtempSync(join(tmpdir(), 'dev-container-gh-')), 'gh')
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
  return path
}

const loggedIn = fakeGh('echo gho_from_gh')

describe('setup', () => {
  it('creates a working project with GH_TOKEN from gh', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-setup-'))
    const { changes, warnings } = setup({ root, ports: ['3000', '5170-5172'], gh: loggedIn })

    expect(changes).toEqual([
      'created dev-container.config.ts',
      'created .env',
      'filled GH_TOKEN in .env.secret from `gh auth token`',
      'created .env.secret',
      'added .env, .env.secret, .dev-container/ to .gitignore',
    ])
    expect(warnings).toEqual([])
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toBe('# Brokered: the container only ever sees placeholders for these.\nGH_TOKEN=gho_from_gh\nNPM_TOKEN=\n')
    expect(statSync(join(root, '.env.secret')).mode & 0o777).toBe(0o600)

    const { config } = await loadConfig(root)
    expect(config.services.agent?.ports.map(p => p.port)).toEqual([3000, '5170-5172'])
    const { warnings: generated, dir } = generate({ config, root, env: {} })
    expect(readFileSync(join(dir, 'env/broker.env'), 'utf8')).toBe(`DEV_CONTAINER_SECRET_GH_TOKEN='gho_from_gh'\n`)
    expect(generated.map(w => w.name)).toEqual(['DEV_CONTAINER_S2002'])
  })

  it('keeps existing files and values, and only fills gaps', () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-setup-'))
    writeFileSync(join(root, 'dev-container.config.mjs'), 'export default {}\n')
    writeFileSync(join(root, '.env.secret'), 'GH_TOKEN=\nOTHER=keep\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n/.env')

    expect(setup({ root, gh: loggedIn }).changes).toEqual([
      'created .env',
      'filled GH_TOKEN in .env.secret from `gh auth token`',
      'updated .env.secret',
      'added .env.secret, .dev-container/ to .gitignore',
    ])
    expect(readFileSync(join(root, 'dev-container.config.mjs'), 'utf8')).toBe('export default {}\n')
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toBe('GH_TOKEN=gho_from_gh\nOTHER=keep\nNPM_TOKEN=\n')
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n/.env\n.env.secret\n.dev-container/\n')

    expect(setup({ root, gh: fakeGh('echo should-not-be-used') }).changes).toEqual([])
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toContain('GH_TOKEN=gho_from_gh\n')
  })

  it.each([
    ['not installed', join(tmpdir(), 'no-such-gh'), 'Could not prefill GH_TOKEN: the gh CLI is not installed.'],
    ['logged out', fakeGh('echo "not logged in" >&2; exit 1'), 'Could not prefill GH_TOKEN: the gh CLI is not logged in.'],
  ])('leaves GH_TOKEN empty with a warning when gh is %s', (_, gh, message) => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-setup-'))
    const { warnings } = setup({ root, gh })
    expect(warnings).toEqual([expect.objectContaining({ name: 'DEV_CONTAINER_S2006', message })])
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toContain('GH_TOKEN=\n')
  })
})
