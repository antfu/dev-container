import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig, up } from '../src'

const docker = fileURLToPath(new URL('fixtures/fake-docker.mjs', import.meta.url))
let tmp: string
const execs = () => readFileSync(join(tmp, 'log'), 'utf8').split('\n').filter(line => line.includes(' exec '))

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dev-container-gpg-'))
  vi.stubEnv('FAKE_DOCKER_LOG', join(tmp, 'log'))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function run(builtins: object, env: NodeJS.ProcessEnv) {
  const warnings: unknown[] = []
  const config = resolveConfig({
    builtins: { github: false, npm: false, ...builtins },
    services: {
      agent: { image: 'x' },
      site: { image: 'y' },
    },
  })
  return up({
    config,
    root: mkdtempSync(join(tmpdir(), 'dev-container-root-')),
    env,
    docker,
    onWarnings: w => warnings.push(...w),
  }).then(code => ({ code, warnings }))
}

describe('gpg builtin', () => {
  it('imports the key into every service that has gpg once the stack is up', async () => {
    const { code, warnings } = await run({ gpg: 'auto' }, { GPG_PRIVATE_KEY: '-----BEGIN PGP PRIVATE KEY BLOCK-----' })
    expect(code).toBe(0)
    expect(warnings).toEqual([])
    // Each service is probed for gpg first, then given the key.
    expect(execs()).toHaveLength(4)
  })

  it('does nothing when the key is unset or the builtin is off', async () => {
    await run({ gpg: 'auto' }, {})
    await run({}, { GPG_PRIVATE_KEY: 'x' })
    await run({ gpg: false }, { GPG_PRIVATE_KEY: 'x' })
    expect(execs()).toEqual([])
  })

  it('reports a missing key as a warning without failing the run', async () => {
    const { code, warnings } = await run({
      gpg: {
        privateKey: { env: 'MISSING_KEY' },
      },
    }, {})
    expect(code).toBe(0)
    expect(warnings).toEqual([
      expect.objectContaining({ name: 'DEV_CONTAINER_S2001' }),
    ])
  })
})
