import type { UserConfig } from '../src'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { buildStack, resolveConfig } from '../src'
import { BUILTINS } from '../src/builtins'

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
      secrets: [BUILTINS.github.secret, { env: 'ACME_KEY', hosts: ['*.acme.dev'] }],
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
    expect(stringify(stack.compose, { lineWidth: 0, aliasDuplicateObjects: false })).toMatchSnapshot()
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
            "rules": [],
          },
          {
            "hosts": [
              "*.acme.dev",
            ],
            "name": "ACME_KEY",
            "placeholder": "dc-ACME_KEY-1111111111111111",
            "rules": [],
          },
        ],
      }
    `)
    expect(stack.tailscaleServe).toMatchInlineSnapshot(`
      {
        "tailscale": {
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
        },
      }
    `)
    expect(stack.persistDirs).toEqual([
      '/work/my-project/.dev-container/state/agent/home-paseo',
      '/work/my-project/.dev-container/state/tailscale',
    ])
  })

  it('sets the commit identity from a service\'s git option', () => {
    const { compose } = build({ services: { agent: { image: 'x', git: { name: 'Ada', email: 'ada@example.com' } } } })
    expect(compose.services.agent!.environment).toMatchObject({
      GIT_AUTHOR_NAME: 'Ada',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    })
  })

  it('serves the monitor on the tailnet from a node of its own', () => {
    const { tailscaleServe, compose } = build({
      control: { port: 7357, tailscale: { hostname: 'monitor' } },
      services: { agent: { image: 'x' } },
    })
    expect(tailscaleServe['tailscale-control']).toEqual({
      TCP: { 443: { HTTPS: true } },
      // eslint-disable-next-line no-template-curly-in-string
      Web: { '${TS_CERT_DOMAIN}:443': { Handlers: { '/': { Proxy: 'http://host.docker.internal:7357' } } } },
    })
    expect(compose.services['tailscale-control']).toMatchObject({
      environment: { TS_HOSTNAME: 'monitor' },
      extra_hosts: ['host.docker.internal:host-gateway'],
    })
  })

  it('serves a tailnet port on another port, so nodes can all use 443', () => {
    const { tailscaleServe } = build({
      services: {
        hub: { image: 'x', ports: [{ port: 3000, tailnet: 443 }], tailscale: { hostname: 'hub' } },
        paseo: { image: 'x', ports: [{ port: 6767, tailnet: 443 }], tailscale: { hostname: 'paseo' } },
      },
    })
    expect(tailscaleServe['tailscale-hub']).toEqual({
      TCP: { 443: { HTTPS: true } },
      // eslint-disable-next-line no-template-curly-in-string
      Web: { '${TS_CERT_DOMAIN}:443': { Handlers: { '/': { Proxy: 'http://hub:3000' } } } },
    })
    expect(Object.keys(tailscaleServe['tailscale-paseo']!.TCP)).toEqual(['443'])
  })

  it('serves a service with its own tailscale from its own node', () => {
    const stack = build({
      tailscale: { hostname: 'hub', authKey: { env: 'HUB_KEY' } },
      services: {
        hub: { image: 'x', ports: [{ port: 3000, tailnet: true }] },
        paseo: { image: 'x', ports: [{ port: 6767, tailnet: true }], tailscale: { hostname: 'paseo' } },
      },
    })
    expect(Object.keys(stack.tailscaleServe)).toEqual(['tailscale', 'tailscale-paseo'])
    expect(Object.keys(stack.tailscaleServe['tailscale-paseo']!.TCP)).toEqual(['6767'])
    expect(Object.keys(stack.tailscaleServe.tailscale!.TCP)).toEqual(['3000'])
    expect(stack.compose.services['tailscale-paseo']).toMatchObject({
      env_file: [{ path: '/work/my-project/.dev-container/env/tailscale-paseo.env', required: true }],
      environment: { TS_HOSTNAME: 'paseo' },
      volumes: [
        '/work/my-project/.dev-container/state/tailscale-paseo:/var/lib/tailscale',
        '/work/my-project/.dev-container/tailscale-paseo-serve.json:/config/serve.json:ro',
      ],
    })
  })

  it('needs no top-level tailscale when every tailnet service has its own', () => {
    const { compose } = build({ services: { paseo: { image: 'x', ports: [{ port: 6767, tailnet: true }], tailscale: { hostname: 'paseo' } } } })
    expect(Object.keys(compose.services)).toEqual(['broker', 'paseo', 'relay', 'tailscale-paseo'])
  })

  it('omits the relay and tailscale when nothing is published', () => {
    const { compose } = build({ services: { agent: { image: 'alpine' } } })
    expect(Object.keys(compose.services)).toEqual(['broker', 'agent'])
    expect(compose.name).toBe('my-project')
    expect(compose.networks.caged).toEqual({ internal: true })
    expect(compose.services.agent!.networks).toEqual(['caged'])
  })

  it('passes request rules to the broker in order', () => {
    const { rules } = build({
      secrets: [{
        env: 'ACME_KEY',
        hosts: ['api.acme.dev'],
        rules: [{ action: 'allow', method: ['get', 'HEAD'], path: '/v1/**' }, { action: 'deny' }],
      }],
      services: { agent: { image: 'alpine' } },
    })
    expect(rules.secrets[0]!.rules).toEqual([{ action: 'allow', methods: ['GET', 'HEAD'], path: '/v1/**' }, { action: 'deny' }])
  })

  it('lets a service share another one\'s network, with its ports reached through the owner', () => {
    const { compose, tailscaleServe } = build({
      tailscale: { hostname: 'agents' },
      services: {
        browser: { image: 'chromium', ports: [6901] },
        agent: { image: 'paseo', network: 'service:browser', ports: [{ port: 6767, tailnet: true }] },
      },
    })
    expect(compose.services.agent!.network_mode).toBe('service:browser')
    expect(compose.services.agent!.networks).toBeUndefined()
    expect(compose.services.browser!.networks).toEqual(['caged'])
    expect(compose.services.relay!.command).toEqual(['browser:6901', 'browser:6767'])
    expect(Object.values(tailscaleServe.tailscale!.Web).map(web => web.Handlers['/']!.Proxy)).toEqual(['http://browser:6767'])
  })

  it('brackets an IPv6 bind address', () => {
    const { compose } = build({ bind: '::1', services: { agent: { image: 'alpine', ports: [3000] } } })
    expect(compose.services.relay!.ports).toEqual(['[::1]:3000:3000'])
  })

  it('resolves relative and home volume paths but keeps named volumes', () => {
    const { compose } = build({ services: { agent: { image: 'alpine', volumes: ['./src:/src', '/abs:/abs:ro', 'data:/data'] } } })
    expect(compose.services.agent!.volumes).toEqual(['ca:/etc/dev-container/ca:ro', '/work/my-project/src:/src', '/abs:/abs:ro', 'data:/data'])
  })

  it('never puts real secret values into the compose file', () => {
    const { compose } = build({ secrets: [BUILTINS.github.secret], services: { agent: { image: 'alpine' } } })
    const environment = compose.services.agent!.environment!
    expect(environment.GH_TOKEN).toBe(ctx.placeholders.GH_TOKEN)
    expect(environment.GITHUB_TOKEN).toBe(ctx.placeholders.GH_TOKEN)
    expect(compose.services.broker!.env_file).toEqual([{ path: '/work/my-project/.dev-container/env/broker.env', required: true }])
  })

  it.each<[string, string, UserConfig]>([
    ['overlapping ports', 'N3001', { services: { a: { image: 'x', ports: ['3000-3002'] }, b: { image: 'x', ports: [3001] } } }],
    ['a reversed range', 'N3002', { services: { a: { image: 'x', ports: ['3002-3000'] } } }],
    ['port 0', 'N3002', { services: { a: { image: 'x', ports: ['0'] } } }],
    ['a port above 65535', 'N3002', { services: { a: { image: 'x', ports: ['99999'] } } }],
    ['an oversized range', 'N3003', { services: { a: { image: 'x', ports: ['1-65535'] } } }],
    ['a tailnet range', 'N3004', { tailscale: { hostname: 'h' }, services: { a: { image: 'x', ports: [{ port: '3000-3001', tailnet: true }] } } }],
    ['tailnet without tailscale', 'N3005', { services: { a: { image: 'x', ports: [{ port: 3000, tailnet: true }] } } }],
    ['colliding persist paths', 'N3006', { services: { a: { image: 'x', persist: ['/a/b-c', '/a/b/c'] } } }],
    ['a network of an unknown service', 'N3007', { services: { a: { image: 'x', network: 'service:broker' } } }],
    ['a network of itself', 'N3007', { services: { a: { image: 'x', network: 'service:a' } } }],
    ['a chained network', 'N3007', { services: { a: { image: 'x' }, b: { image: 'x', network: 'service:a' }, c: { image: 'x', network: 'service:b' } } }],
  ])('rejects %s', (_, code, config) => {
    expect(() => build(config)).toThrow(expect.objectContaining({ name: `DEV_CONTAINER_${code}` }))
  })
})

describe('resolveConfig', () => {
  it.each<[string, string, UserConfig]>([
    ['no services', 'services', { services: {} }],
    ['a reserved service name', 'services', { services: { broker: { image: 'x' } } }],
    ['a service name with the tailscale- prefix', 'services', { services: { 'tailscale-a': { image: 'x' } } }],
    ['a service without image or build', 'services.a', { services: { a: {} } }],
    ['a malformed host pattern', 'secrets.0.hosts.0', { secrets: [{ env: 'X', hosts: ['https://x.dev'] }], services: { a: { image: 'x' } } }],
    ['a relative persist path', 'services.a.persist.0', { services: { a: { image: 'x', persist: ['home'] } } }],
    ['a reserved volume name', 'services.a.volumes.0', { services: { a: { image: 'x', volumes: ['broker-ca:/stolen'] } } }],
    ['a network that is not a service', 'services.a.network', { services: { a: { image: 'x', network: 'host' } } }],
    ['a rule path with a query', 'secrets.0.rules.0.path', { secrets: [{ env: 'X', hosts: ['x.dev'], rules: [{ action: 'deny', path: '/a?b=1' }] }], services: { a: { image: 'x' } } }],
    ['a rule with a bad method', 'secrets.0.rules.0.method', { secrets: [{ env: 'X', hosts: ['x.dev'], rules: [{ action: 'deny', method: 'GET /' }] }], services: { a: { image: 'x' } } }],
  ])('rejects %s', (_, path, config) => {
    expect(() => resolveConfig(config, '/work/dev-container.config.ts')).toThrow(expect.objectContaining({
      errors: [expect.objectContaining({ name: 'DEV_CONTAINER_C1002', data: { path }, sources: ['/work/dev-container.config.ts'] })],
    }))
  })

  it('reports every invalid field at once', () => {
    const error = (() => {
      try {
        // Ill-typed on purpose, as a hand-written JS config could be.
        resolveConfig(JSON.parse('{ "bind": 1, "services": { "a": {}, "b": { "image": "x", "persist": ["rel"] } } }'))
      }
      catch (error) {
        return error
      }
    })()
    if (!(error instanceof AggregateError))
      expect.unreachable()
    expect(error.errors.map(e => e.message)).toMatchInlineSnapshot(`
      [
        "Invalid config at \`bind\`: Invalid input: expected string, received number.",
        "Invalid config at \`services.a\`: requires \`image\` or \`build\`.",
        "Invalid config at \`services.b.persist.0\`: Invalid string: must start with "/".",
      ]
    `)
  })
})
