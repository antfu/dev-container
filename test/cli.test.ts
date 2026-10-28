import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
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
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }], services: { agent: { image: 'alpine' } } }\n`)
    mkdirSync(join(root, 'nested'))

    const result = run(join(root, 'nested'), ['generate'], { ACME_KEY: 'real' })
    expect(result).toEqual({ code: 0, output: `Generated ${join(root, '.dev-container/compose.yml')}\n` })
    expect(existsSync(join(root, '.dev-container/env/broker.env'))).toBe(true)
  })

  it('fails with the missing secret named', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }], services: { agent: { image: 'alpine' } } }\n`)
    const { code, output } = run(root, ['generate', '--json'])
    expect(code).toBe(1)
    expect(JSON.parse(output)).toEqual({
      level: 'error',
      name: 'DEV_CONTAINER_S2001',
      why: 'secret ACME_KEY: $ACME_KEY is not set in the environment or any envFile.',
      fix: 'Add `ACME_KEY=...` to .env.secret (or export it in the shell), or point the source at a `{ command }`.',
      docs: 'https://github.com/antfu/dev-container/blob/main/docs/errors/DEV_CONTAINER_S2001.md',
    })
  })

  it('prints readable diagnostics for people', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { services: { agent: { image: 'alpine', ports: ['0'] } } }\n`)
    expect(run(root, ['generate'], { NO_COLOR: '1' })).toEqual({
      code: 1,
      output: [
        '[DEV_CONTAINER_N3002] Invalid port range 0 on service agent.',
        '├▶ fix: Use a port between 1 and 65535, or `start-end` with start <= end.',
        '╰▶ see: https://github.com/antfu/dev-container/blob/main/docs/errors/DEV_CONTAINER_N3002.md',
        '',
      ].join('\n'),
    })
  })

  it('sets up a project without prompting when not on a terminal', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    const bin = mkdtempSync(join(tmpdir(), 'dev-container-bin-'))
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho gho_from_gh\n', { mode: 0o755 })
    const result = run(root, ['setup'], { PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).toBe(0)
    expect(result.output).toContain('✔ filled GH_TOKEN in .env.secret from `gh auth token`\n')
    expect(result.output).toContain('Next: review dev-container.config.ts, then run `npx @antfu/dev-container up`.')
    expect(run(root, ['generate']).code).toBe(0)
  })

  it('syncs a config repo and reports each stack', () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'ignore' })
    git(tmp, 'init', '--bare', '-b', 'main', 'remote.git')
    git(tmp, 'clone', 'remote.git', 'host')
    const host = join(tmp, 'host')
    mkdirSync(join(host, 'agents'))
    writeFileSync(join(host, 'agents/dev-container.config.mjs'), `export default { builtins: { github: false, npm: false }, services: { agent: { image: 'alpine' } } }\n`)
    git(host, 'add', '.')
    git(host, 'commit', '-m', 'init')
    git(host, 'push', '-u', 'origin', 'main')
    const bin = mkdtempSync(join(tmpdir(), 'dev-container-bin-'))
    symlinkSync(fileURLToPath(new URL('fixtures/fake-docker.mjs', import.meta.url)), join(bin, 'docker'))
    const env = { PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_LOG: join(tmp, 'log') }

    expect(run(host, ['sync'], env)).toEqual({ code: 0, output: 'Already up to date.\n✔ updated agents\n' })
    expect(run(host, ['sync'], env)).toEqual({ code: 0, output: 'Already up to date.\n· unchanged agents\n' })
  })

  it('rejects unknown commands', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-cli-')))
    writeFileSync(join(root, 'dev-container.config.mjs'), `export default { services: { agent: { image: 'alpine' } } }\n`)
    expect(run(root, ['nope']).code).toBe(1)
  })
})
