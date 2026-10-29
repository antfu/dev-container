import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generate, loadConfig, setup } from '../src'

describe('setup', () => {
  it('creates a working project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-setup-'))
    const { changes } = setup({
      root,
      ports: ['3000', '5170-5172'],
    })

    expect(changes).toEqual([
      'created dev-container.config.ts',
      'created .env',
      'created .env.secret',
      'added .env, .env.secret, .dev-container/ to .gitignore',
    ])
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toBe('# Brokered: the container only ever sees placeholders for these.\nGITHUB_TOKEN=\nNPM_TOKEN=\n')
    expect(statSync(join(root, '.env.secret')).mode & 0o777).toBe(0o600)

    const { config } = await loadConfig(root)
    expect(config.services.agent?.ports.map(p => p.port)).toEqual([3000, '5170-5172'])
    const { warnings } = generate({ config, root, env: {} })
    expect(warnings.map(w => w.name)).toEqual(['DEV_CONTAINER_S2002', 'DEV_CONTAINER_S2002'])
  })

  it('keeps existing files and values, and only fills gaps', () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-setup-'))
    writeFileSync(join(root, 'dev-container.config.mjs'), 'export default {}\n')
    writeFileSync(join(root, '.env.secret'), 'GITHUB_TOKEN=gho_kept\nOTHER=keep\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n/.env')

    expect(setup({ root }).changes).toEqual([
      'created .env',
      'updated .env.secret',
      'added .env.secret, .dev-container/ to .gitignore',
    ])
    expect(readFileSync(join(root, 'dev-container.config.mjs'), 'utf8')).toBe('export default {}\n')
    expect(readFileSync(join(root, '.env.secret'), 'utf8')).toBe('GITHUB_TOKEN=gho_kept\nOTHER=keep\nNPM_TOKEN=\n')
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n/.env\n.env.secret\n.dev-container/\n')

    expect(setup({ root }).changes).toEqual([])
  })
})
