import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    return { code: 0, output: execFileSync(process.execPath, [cli, ...args], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', stdio: 'pipe' }) }
  }
  catch (error) {
    const { status, stderr } = error as { status: number, stderr: string }
    return { code: status, output: stderr }
  }
}

describe('cli', () => {
  it('generates the stack from a config found in a parent directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-cli-'))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }], services: { agent: { image: 'alpine' } } }\n`)
    mkdirSync(join(root, 'nested'))

    const result = run(join(root, 'nested'), ['generate'], { ACME_KEY: 'real' })
    expect(result).toEqual({ code: 0, output: `Generated ${join(root, '.dev-container/compose.yml')}\n` })
    expect(existsSync(join(root, '.dev-container/env/broker.env'))).toBe(true)
  })

  it('fails with the missing secret named', () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-cli-'))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }], services: { agent: { image: 'alpine' } } }\n`)
    expect(run(root, ['generate'])).toEqual({
      code: 1,
      output: 'Could not resolve secrets:\n  - secret ACME_KEY: $ACME_KEY is not set in the environment or envFile\n',
    })
  })

  it('rejects unknown commands', () => {
    const root = mkdtempSync(join(tmpdir(), 'dev-container-cli-'))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { services: { agent: { image: 'alpine' } } }\n`)
    expect(run(root, ['nope']).code).toBe(1)
  })
})
