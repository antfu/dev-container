import type { UserConfig } from '../src'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { buildStack, presets, resolveConfig } from '../src'

const ctx = {
  root: '/work/my-project',
  dir: '/work/my-project/.dev-container',
  assets: '/pkg',
  placeholders: { GH_TOKEN: 'dc-GH_TOKEN-0000000000000000', ACME_KEY: 'dc-ACME_KEY-1111111111111111' },
  controlToken: 'control-token',
}

function build(config: UserConfig) {
  return buildStack(resolveConfig(config), ctx)
}

describe('buildStack', () => {
  it('generates a caged stack with broker, relay and tailscale', () => {
    const stack = build({
      secrets: [presets.github(), { env: 'ACME_KEY', hosts: ['*.acme.dev'] }],
      egress: { policy: 'allowlist', allow: ['registry.npmjs.org'] },
      tailscale: { hostname: 'agents' },
      services: {
        agent: {
          image: 'ghcr.io/getpaseo/paseo:latest',
          command: ['sh', '-c', 'echo $HOME'],
          env: { FOO: 'bar', PASEO_PASSWORD: { env: 'PASEO_PASSWORD' } },
          ports: [{ port: 6767, tailnet: true }, '5170-5172'],
          volumes: ['./projects:/workspace', 'cache:/cache'],
          persist: ['/home/paseo'],
          control: true,
          compose: { mem_limit: '4g' },
        },
      },
    })
    expect(stringify(stack.compose, { lineWidth: 0 })).toMatchSnapshot()
    expect(stack.rules).toMatchInlineSnapshot(`
      {
        "allow": [
          "registry.npmjs.org",
          "host.docker.internal:7357",
        ],
        "policy": "allowlist",
        "secrets": [
          {
            "hosts": [
              "api.github.com",
              "uploads.github.com",
              "github.com",
              "codeload.github.com",
            ],
            "name": "GH_TOKEN",
            "placeholder": "dc-GH_TOKEN-0000000000000000",
          },
          {
            "hosts": [
              "*.acme.dev",
            ],
            "name": "ACME_KEY",
            "placeholder": "dc-ACME_KEY-1111111111111111",
          },
        ],
      }
    `)
    expect(stack.tailscaleServe).toMatchInlineSnapshot(`
      {
        "TCP": {
          "6767": {
            "HTTPS": true,
          },
        },
        "Web": {
          "\${TS_CERT_DOMAIN}:6767": {
            "Handlers": {
              "/": {
                "Proxy": "http://agent:6767",
              },
            },
          },
        },
      }
    `)
    expect(stack.persistDirs).toEqual([
      '/work/my-project/.dev-container/state/agent/home-paseo',
      '/work/my-project/.dev-container/state/tailscale',
    ])
  })

  it('omits the relay and tailscale when nothing is published', () => {
    const { compose } = build({ services: { agent: { image: 'alpine' } } })
    expect(Object.keys(compose.services)).toEqual(['broker', 'agent'])
    expect(compose.name).toBe('my-project')
    expect(compose.networks.caged).toEqual({ internal: true })
    expect(compose.services.agent!.networks).toEqual(['caged'])
  })

  it('never puts real secret values into the compose file', () => {
    const { compose } = build({ secrets: [presets.github()], services: { agent: { image: 'alpine' } } })
    const environment = compose.services.agent!.environment!
    expect(environment.GH_TOKEN).toBe(ctx.placeholders.GH_TOKEN)
    expect(environment.GITHUB_TOKEN).toBe(ctx.placeholders.GH_TOKEN)
    expect(compose.services.broker!.env_file).toEqual([{ path: '/work/my-project/.dev-container/env/broker.env', required: true }])
  })

  it.each<[string, UserConfig]>([
    ['overlapping ports', { services: { a: { image: 'x', ports: ['3000-3002'] }, b: { image: 'x', ports: [3001] } } }],
    ['a tailnet range', { tailscale: { hostname: 'h' }, services: { a: { image: 'x', ports: [{ port: '3000-3001', tailnet: true }] } } }],
    ['tailnet without tailscale', { services: { a: { image: 'x', ports: [{ port: 3000, tailnet: true }] } } }],
    ['a reversed range', { services: { a: { image: 'x', ports: ['3002-3000'] } } }],
  ])('rejects %s', (_, config) => {
    expect(() => build(config)).toThrowErrorMatchingSnapshot()
  })
})

describe('resolveConfig', () => {
  it.each<[string, UserConfig]>([
    ['no services', { services: {} }],
    ['a reserved service name', { services: { broker: { image: 'x' } } }],
    ['a service without image or build', { services: { a: {} } }],
    ['a malformed host pattern', { secrets: [{ env: 'X', hosts: ['https://x.dev'] }], services: { a: { image: 'x' } } }],
    ['a relative persist path', { services: { a: { image: 'x', persist: ['home'] } } }],
  ])('rejects %s', (_, config) => {
    expect(() => resolveConfig(config)).toThrowErrorMatchingSnapshot()
  })
})
