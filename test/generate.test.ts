import type { UserConfig } from '../src'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generate, resolveConfig } from '../src'

const agent = { agent: { image: 'alpine' } }

function project() {
  return mkdtempSync(join(tmpdir(), 'dev-container-'))
}

function run(config: UserConfig, env: NodeJS.ProcessEnv, root = project()) {
  const result = generate({ config: resolveConfig(config), root, env })
  const { services } = parse(readFileSync(result.composeFile, 'utf8'))
  return { ...result, root, services, brokerEnv: readFileSync(join(result.dir, 'env/broker.env'), 'utf8') }
}

describe('generate', () => {
  it('writes resolved secrets only to 0600 env files', () => {
    const root = project()
    writeFileSync(join(root, '.env'), 'ACME_KEY=from-env\nCMD_KEY=unused\n')
    writeFileSync(join(root, '.env.secret'), 'ACME_KEY=from-secret\n')
    const { dir, composeFile, services, brokerEnv } = run({
      envFile: ['.env', '.env.secret'],
      secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }, { env: 'CMD_KEY', hosts: ['x.dev'], from: { command: 'echo from-command' } }],
      services: { agent: { image: 'alpine', env: { PASSWORD: { env: 'APP_PASSWORD' } } } },
    }, { GH_TOKEN: 'ghp_real', APP_PASSWORD: 'hunter2' }, root)

    expect(brokerEnv).toBe(
      `DEV_CONTAINER_SECRET_GH_TOKEN='ghp_real'\nDEV_CONTAINER_SECRET_ACME_KEY='from-secret'\nDEV_CONTAINER_SECRET_CMD_KEY='from-command'\n`,
    )
    expect(statSync(join(dir, 'env/broker.env')).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(dir, 'env/agent.env'), 'utf8')).toBe(`PASSWORD='hunter2'\n`)

    const compose = readFileSync(composeFile, 'utf8')
    expect(compose).not.toContain('ghp_real')
    expect(compose).not.toContain('hunter2')
    const placeholder: string = services.agent.environment.GH_TOKEN
    expect(placeholder).toMatch(/^dc-GH_TOKEN-[0-9a-f]{16}$/)
    expect(JSON.parse(services.broker.environment.DEV_CONTAINER_RULES).secrets[0].placeholder).toBe(placeholder)
  })

  it('regenerates placeholders in both the broker and the cage, but keeps the control token', () => {
    const root = project()
    const placeholder = () => {
      const { services } = run({ services: agent }, { NPM_TOKEN: 'npm_real' }, root)
      expect(services.broker.environment.DEV_CONTAINER_RULES).toContain(services.agent.environment.NPM_TOKEN)
      return services.agent.environment.NPM_TOKEN
    }
    const token = () => readFileSync(join(root, '.dev-container/control-token'), 'utf8')

    const [first, firstToken] = [placeholder(), token()]
    expect(placeholder()).not.toBe(first)
    expect(token()).toBe(firstToken)
  })

  it('reports every missing secret before writing anything', () => {
    const root = project()
    const config = resolveConfig({
      builtins: { github: { from: { env: 'GH_TOKEN' } } },
      secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }],
      tailscale: { hostname: 'h' },
      services: agent,
    })
    expect(() => generate({ config, root, env: {} })).toThrow(expect.objectContaining({
      errors: [
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'secret GH_TOKEN: $GH_TOKEN is not set in the environment or any envFile.' }),
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'secret ACME_KEY: $ACME_KEY is not set in the environment or any envFile.' }),
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'tailscale.authKey: $TS_AUTHKEY is not set in the environment or any envFile.' }),
      ],
    }))
    expect(() => statSync(join(root, '.dev-container'))).toThrow()
  })

  it('writes an auth key and serve config per tailscale node, falling back to the top-level key', () => {
    const { dir } = run({
      tailscale: { hostname: 'hub', authKey: { env: 'HUB_KEY' } },
      services: {
        hub: { image: 'x' },
        paseo: { image: 'x', ports: [{ port: 6767, tailnet: true }], tailscale: { hostname: 'paseo' } },
        vi: { image: 'x', tailscale: { hostname: 'vi', authKey: { command: 'echo vi-key' } } },
      },
    }, { HUB_KEY: 'hub-key' })
    expect(readFileSync(join(dir, 'env/tailscale.env'), 'utf8')).toBe(`TS_AUTHKEY='hub-key'\n`)
    expect(readFileSync(join(dir, 'env/tailscale-paseo.env'), 'utf8')).toBe(`TS_AUTHKEY='hub-key'\n`)
    expect(readFileSync(join(dir, 'env/tailscale-vi.env'), 'utf8')).toBe(`TS_AUTHKEY='vi-key'\n`)
    expect(JSON.parse(readFileSync(join(dir, 'tailscale-paseo-serve.json'), 'utf8')).TCP).toEqual({ 6767: { HTTPS: true } })
    expect(JSON.parse(readFileSync(join(dir, 'tailscale-serve.json'), 'utf8')).TCP).toEqual({})
  })
})

describe('builtin secrets', () => {
  it('brokers github and npm when their tokens are set', () => {
    const { services, brokerEnv, warnings } = run({ services: agent }, { GITHUB_TOKEN: 'ghp_real', NPM_TOKEN: 'npm_real' })
    expect(brokerEnv).toBe(`DEV_CONTAINER_SECRET_GH_TOKEN='ghp_real'\nDEV_CONTAINER_SECRET_NPM_TOKEN='npm_real'\n`)
    expect(services.agent.environment).toMatchObject({
      GH_TOKEN: expect.stringMatching(/^dc-GH_TOKEN-/),
      GITHUB_TOKEN: services.agent.environment.GH_TOKEN,
      GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
      NPM_TOKEN: expect.stringMatching(/^dc-NPM_TOKEN-/),
    })
    expect(warnings).toEqual([])
  })

  it('reads tokens from envFiles too', () => {
    const root = project()
    writeFileSync(join(root, '.env.secret'), 'GH_TOKEN=from-file\n')
    expect(run({ envFile: '.env.secret', services: agent }, {}, root).brokerEnv).toContain(`DEV_CONTAINER_SECRET_GH_TOKEN='from-file'`)
  })

  it('brokers every secretFile variable, binding only the ones a builtin or secret gives hosts', () => {
    const root = project()
    writeFileSync(join(root, '.env.secret'), 'GITHUB_TOKEN=ghp_real\nACME_KEY=acme_real\nSTRAY_KEY=stray_real\nTS_AUTHKEY=tskey\nAPP_PASSWORD=hunter2\n')
    const { services, brokerEnv } = run({
      secretFile: '.env.secret',
      builtins: { npm: false },
      secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev'] }],
      tailscale: { hostname: 'ts' },
      services: { agent: { image: 'alpine', ports: [{ port: 80, tailnet: true }], env: { PASSWORD: { env: 'APP_PASSWORD' } } } },
    }, {}, root)

    // The token the builtin did not claim is brokered with no host; sources read as `{ env }` are not.
    expect(brokerEnv).toBe(
      `DEV_CONTAINER_SECRET_GH_TOKEN='ghp_real'\nDEV_CONTAINER_SECRET_ACME_KEY='acme_real'\nDEV_CONTAINER_SECRET_STRAY_KEY='stray_real'\n`,
    )
    expect(services.agent.environment.STRAY_KEY).toMatch(/^dc-STRAY_KEY-[0-9a-f]{16}$/)
    expect(services.agent.environment.TS_AUTHKEY).toBeUndefined()
    expect(services.agent.environment.APP_PASSWORD).toBeUndefined()
    const rules = JSON.parse(services.broker.environment.DEV_CONTAINER_RULES)
    expect(rules.secrets.map((s: { name: string, hosts: string[] }) => [s.name, s.hosts])).toEqual([
      ['GH_TOKEN', expect.arrayContaining(['api.github.com'])],
      ['ACME_KEY', ['api.acme.dev']],
      ['STRAY_KEY', []],
    ])
  })

  it('warns and leaves the cage without a placeholder when a token is unset', () => {
    const { services, warnings } = run({ services: agent }, { GH_TOKEN: 'ghp_real' })
    expect(services.agent.environment.NPM_TOKEN).toBeUndefined()
    expect(warnings.map(w => w.name)).toEqual(['DEV_CONTAINER_S2002'])
  })

  it('can be turned off or given another source', () => {
    const { services, brokerEnv, warnings } = run({
      builtins: { github: { from: { command: 'echo from-command' } }, npm: false },
      services: agent,
    }, { NPM_TOKEN: 'npm_real' })
    expect(brokerEnv).toBe(`DEV_CONTAINER_SECRET_GH_TOKEN='from-command'\n`)
    expect(services.agent.environment.NPM_TOKEN).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('takes request rules while keeping the detected token', () => {
    const { brokerEnv, services } = run({
      builtins: { github: { rules: [{ action: 'deny', method: 'DELETE', path: '/repos/**' }] } },
      services: agent,
    }, { GH_TOKEN: 'ghp_real', NPM_TOKEN: 'npm_real' })
    expect(brokerEnv).toContain(`DEV_CONTAINER_SECRET_GH_TOKEN='ghp_real'`)
    const [github, npm] = JSON.parse(services.broker.environment.DEV_CONTAINER_RULES).secrets
    expect(github.rules).toEqual([{ action: 'deny', methods: ['DELETE'], path: '/repos/**' }])
    expect(npm.rules).toEqual([])
  })

  it('stays off with rules but no token', () => {
    const { warnings, services } = run({ builtins: { github: { rules: [{ action: 'deny' }] } }, services: agent }, { NPM_TOKEN: 'npm_real' })
    expect(services.agent.environment.GH_TOKEN).toBeUndefined()
    expect(warnings.map(w => w.name)).toEqual(['DEV_CONTAINER_S2002'])
  })

  it('rejects a custom secret that claims a builtin variable', () => {
    expect(() => run({ secrets: [{ env: 'GITHUB_TOKEN', hosts: ['x.dev'] }], services: agent }, { GH_TOKEN: 'ghp_real' })).toThrow(expect.objectContaining({
      name: 'DEV_CONTAINER_C1003',
      fix: 'Remove the custom secret, or turn the builtin off with `builtins: { github: false }`.',
    }))
  })
})
