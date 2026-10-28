import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { generate, presets, resolveConfig } from '../src'

function project() {
  return mkdtempSync(join(tmpdir(), 'dev-container-'))
}

describe('generate', () => {
  it('writes resolved secrets only to 0600 env files', () => {
    const root = project()
    writeFileSync(join(root, 'secrets.env'), 'ACME_KEY=from-file\n')
    const config = resolveConfig({
      envFile: 'secrets.env',
      secrets: [presets.github(), { env: 'ACME_KEY', hosts: ['api.acme.dev'] }, { env: 'CMD_KEY', hosts: ['x.dev'], from: { command: 'echo from-command' } }],
      services: { agent: { image: 'alpine', env: { PASSWORD: { env: 'APP_PASSWORD' } } } },
    })
    const { dir, composeFile } = generate({ config, root, env: { GH_TOKEN: 'ghp_real', APP_PASSWORD: 'hunter2' } })

    const brokerEnv = join(dir, 'env/broker.env')
    expect(readFileSync(brokerEnv, 'utf8')).toBe(
      `DEV_CONTAINER_SECRET_GH_TOKEN='ghp_real'\nDEV_CONTAINER_SECRET_ACME_KEY='from-file'\nDEV_CONTAINER_SECRET_CMD_KEY='from-command'\n`,
    )
    expect(statSync(brokerEnv).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(dir, 'env/agent.env'), 'utf8')).toBe(`PASSWORD='hunter2'\n`)

    const compose = readFileSync(composeFile, 'utf8')
    expect(compose).not.toContain('ghp_real')
    expect(compose).not.toContain('hunter2')
    const { services } = parse(compose)
    const placeholder: string = services.agent.environment.GH_TOKEN
    expect(placeholder).toMatch(/^dc-GH_TOKEN-[0-9a-f]{16}$/)
    expect(JSON.parse(services.broker.environment.DEV_CONTAINER_RULES).secrets[0].placeholder).toBe(placeholder)
  })

  it('regenerates placeholders in both the broker and the cage, but keeps the control token', () => {
    const root = project()
    const config = resolveConfig({ secrets: [presets.npm()], services: { agent: { image: 'alpine' } } })
    const read = () => {
      const { services } = parse(readFileSync(join(root, '.dev-container/compose.yml'), 'utf8'))
      expect(services.broker.environment.DEV_CONTAINER_RULES).toContain(services.agent.environment.NPM_TOKEN)
      return services.agent.environment.NPM_TOKEN
    }
    const token = () => readFileSync(join(root, '.dev-container/control-token'), 'utf8')

    generate({ config, root, env: { NPM_TOKEN: 'npm_real' } })
    const [first, firstToken] = [read(), token()]
    generate({ config, root, env: { NPM_TOKEN: 'npm_real' } })
    expect(read()).not.toBe(first)
    expect(token()).toBe(firstToken)
  })

  it('reports every missing secret before writing anything', () => {
    const root = project()
    const config = resolveConfig({
      secrets: [presets.github(), presets.npm()],
      tailscale: { hostname: 'h' },
      services: { agent: { image: 'alpine' } },
    })
    expect(() => generate({ config, root, env: {} })).toThrow(expect.objectContaining({
      errors: [
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'secret GH_TOKEN: $GH_TOKEN is not set in the environment or any envFile.' }),
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'secret NPM_TOKEN: $NPM_TOKEN is not set in the environment or any envFile.' }),
        expect.objectContaining({ name: 'DEV_CONTAINER_S2001', message: 'tailscale.authKey: $TS_AUTHKEY is not set in the environment or any envFile.' }),
      ],
    }))
    expect(() => statSync(join(root, '.dev-container'))).toThrow()
  })
})
