import type { JsonValue, ResolvedConfig, ResolvedService } from './config'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { defu } from 'defu'

const TAILSCALE_IMAGE = 'tailscale/tailscale:v1.104.2'
const PROXY = 'http://broker:8080'
const CA_DIR = '/etc/dev-container/ca'
const CA_CERT = `${CA_DIR}/mitmproxy-ca-cert.pem`
const RULES_PATH = '/etc/dev-container/rules.json'
const CONTROL_HOST = 'host.docker.internal'

interface ComposeService {
  [key: string]: JsonValue | undefined
  image?: string
  build?: { context: string, dockerfile?: string }
  command?: string | string[]
  environment?: Record<string, string>
  env_file?: { path: string, required: boolean }[]
  networks: string[]
  ports?: string[]
  volumes?: string[]
  depends_on?: Record<string, { condition: string }>
  extra_hosts?: string[]
  healthcheck?: { test: string[], interval: string, timeout: string, retries: number }
  restart: string
}

export interface ComposeFile {
  name: string
  services: Record<string, ComposeService>
  networks: Record<string, { internal?: boolean }>
  volumes: Record<string, Record<string, never>>
}

/** The broker's view of the config; carries placeholders, never real values. */
export interface BrokerRules {
  policy: 'open' | 'allowlist'
  allow: string[]
  secrets: { name: string, placeholder: string, hosts: string[] }[]
}

interface TailscaleServe {
  TCP: Record<string, { HTTPS: true }>
  Web: Record<string, { Handlers: Record<string, { Proxy: string }> }>
}

export interface StackContext {
  /** Project root; relative paths in the config resolve against it. */
  root: string
  /** Absolute path of the generated `.dev-container` directory. */
  dir: string
  /** Package root that holds the `broker/` and `relay/` build contexts. */
  assets: string
  /** Secret env name -> placeholder. */
  placeholders: Record<string, string>
  controlToken: string
}

export interface Stack {
  compose: ComposeFile
  rules: BrokerRules
  tailscaleServe?: TailscaleServe
  /** Host directories that must exist before `docker compose up`. */
  persistDirs: string[]
}

interface PublishedPort {
  service: string
  start: number
  end: number
  tailnet: boolean
}

export function envFilePath(dir: string, name: string): string {
  return join(dir, 'env', `${name}.env`)
}

/** Builds the compose project, broker rules and tailscale serve config. Pure. */
export function buildStack(config: ResolvedConfig, ctx: StackContext): Stack {
  const environment = cageEnvironment(config, ctx)
  const ports = collectPorts(config)
  const usesControl = Object.values(config.services).some(s => s.control)
  const persistDirs: string[] = []

  const services: Record<string, ComposeService> = {
    broker: {
      build: { context: join(ctx.assets, 'broker') },
      networks: ['caged', 'egress'],
      env_file: [{ path: envFilePath(ctx.dir, 'broker'), required: true }],
      environment: { DEV_CONTAINER_RULES: RULES_PATH },
      volumes: [
        `${join(ctx.dir, 'rules.json')}:${RULES_PATH}:ro`,
        'broker-ca:/home/mitmproxy/.mitmproxy',
        `ca:${CA_DIR}`,
      ],
      ...usesControl && { extra_hosts: [`${CONTROL_HOST}:host-gateway`] },
      healthcheck: {
        test: ['CMD', 'python3', '-c', `import os,socket;assert os.path.exists('${CA_CERT}');socket.create_connection(('127.0.0.1',8080),2)`],
        interval: '2s',
        timeout: '3s',
        retries: 30,
      },
      restart: 'unless-stopped',
    },
  }

  for (const [name, service] of Object.entries(config.services)) {
    const dirs = service.persist.map(path => join(ctx.dir, 'state', name, slugify(path)))
    persistDirs.push(...dirs)
    services[name] = cagedService(config, ctx, name, service, environment, dirs)
  }

  if (ports.length) {
    services.relay = {
      build: { context: join(ctx.assets, 'relay') },
      command: ports.map(p => `${p.service}:${formatRange(p)}`),
      networks: ['caged', 'egress'],
      ports: ports.map(p => `${config.bind}:${formatRange(p)}:${formatRange(p)}`),
      restart: 'unless-stopped',
    }
  }

  let tailscaleServe: TailscaleServe | undefined
  if (config.tailscale) {
    const tailnetPorts = ports.filter(p => p.tailnet)
    tailscaleServe = { TCP: {}, Web: {} }
    for (const { service, start } of tailnetPorts) {
      tailscaleServe.TCP[start] = { HTTPS: true }
      tailscaleServe.Web[`\${TS_CERT_DOMAIN}:${start}`] = { Handlers: { '/': { Proxy: `http://${service}:${start}` } } }
    }
    const state = join(ctx.dir, 'state', 'tailscale')
    persistDirs.push(state)
    services.tailscale = {
      image: TAILSCALE_IMAGE,
      networks: ['caged', 'egress'],
      env_file: [{ path: envFilePath(ctx.dir, 'tailscale'), required: true }],
      environment: {
        TS_HOSTNAME: config.tailscale.hostname,
        TS_STATE_DIR: '/var/lib/tailscale',
        TS_SERVE_CONFIG: '/config/serve.json',
        TS_USERSPACE: 'true',
        TS_AUTH_ONCE: 'true',
      },
      volumes: [
        `${state}:/var/lib/tailscale`,
        `${join(ctx.dir, 'tailscale-serve.json')}:/config/serve.json:ro`,
      ],
      restart: 'unless-stopped',
    }
  }

  const allow = config.egress.policy === 'allowlist' ? [...config.egress.allow] : []
  if (usesControl)
    allow.push(`${CONTROL_HOST}:${config.control.port}`)

  return {
    compose: {
      name: config.name ?? slugify(ctx.root.split(/[\\/]/).pop() || 'dev-container').toLowerCase(),
      services,
      // `caged` has no route out: the broker is the only way to reach anything.
      networks: { caged: { internal: true }, egress: {} },
      volumes: Object.fromEntries(['ca', 'broker-ca', ...namedVolumes(config)].map(name => [name, {}])),
    },
    rules: {
      policy: config.egress.policy,
      allow,
      secrets: config.secrets.map(secret => ({
        name: secret.env,
        placeholder: placeholderOf(ctx, secret.env),
        hosts: secret.hosts,
      })),
    },
    tailscaleServe,
    persistDirs,
  }
}

function cagedService(
  config: ResolvedConfig,
  ctx: StackContext,
  name: string,
  service: ResolvedService,
  baseEnvironment: Record<string, string>,
  persistDirs: string[],
): ComposeService {
  const environment = { ...baseEnvironment }
  if (service.control) {
    environment.DEV_CONTAINER_CONTROL_URL = `http://${CONTROL_HOST}:${config.control.port}`
    environment.DEV_CONTAINER_CONTROL_TOKEN = ctx.controlToken
  }

  const hasSecretEnv = Object.values(service.env).some(value => typeof value !== 'string')
  for (const [key, value] of Object.entries(service.env)) {
    if (typeof value === 'string')
      environment[key] = value
  }

  const generated: ComposeService = {
    ...service.image && { image: service.image },
    ...service.build && {
      build: typeof service.build === 'string'
        ? { context: resolve(ctx.root, service.build) }
        : { ...service.build, context: resolve(ctx.root, service.build.context) },
    },
    ...service.command !== undefined && {
      command: typeof service.command === 'string' ? escapeCompose(service.command) : service.command.map(escapeCompose),
    },
    environment: Object.fromEntries(Object.entries(environment).map(([k, v]) => [k, escapeCompose(v)])),
    ...hasSecretEnv && { env_file: [{ path: envFilePath(ctx.dir, name), required: true }] },
    networks: ['caged'],
    volumes: [
      `ca:${CA_DIR}:ro`,
      ...service.volumes.map(volume => resolveVolume(ctx.root, volume)),
      ...service.persist.map((path, i) => `${persistDirs[i]}:${path}`),
    ],
    depends_on: { broker: { condition: 'service_healthy' } },
    restart: 'unless-stopped',
  }

  // defu keeps every key of `generated`, so the required fields survive the merge.
  return service.compose ? defu(service.compose, generated) as ComposeService : generated
}

/** Proxy, CA trust, placeholders and git credential helpers; shared by every caged service. */
function cageEnvironment(config: ResolvedConfig, ctx: StackContext): Record<string, string> {
  const noProxy = ['localhost', '127.0.0.1', '::1', ...Object.keys(config.services)].join(',')
  const environment: Record<string, string> = {
    HTTP_PROXY: PROXY,
    HTTPS_PROXY: PROXY,
    http_proxy: PROXY,
    https_proxy: PROXY,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    NODE_USE_ENV_PROXY: '1',
    SSL_CERT_FILE: CA_CERT,
    NODE_EXTRA_CA_CERTS: CA_CERT,
    REQUESTS_CA_BUNDLE: CA_CERT,
    CURL_CA_BUNDLE: CA_CERT,
    GIT_SSL_CAINFO: CA_CERT,
  }
  for (const secret of config.secrets) {
    for (const env of [secret.env, ...secret.aliases])
      environment[env] = placeholderOf(ctx, secret.env)
  }
  const gitSecrets = config.secrets.filter(secret => secret.git)
  if (gitSecrets.length)
    environment.GIT_CONFIG_COUNT = String(gitSecrets.length)
  gitSecrets.forEach(({ env, git }, i) => {
    environment[`GIT_CONFIG_KEY_${i}`] = `credential.https://${git!.host}.helper`
    environment[`GIT_CONFIG_VALUE_${i}`] = `!f() { test "$1" = get && printf 'username=${git!.username}\\npassword=%s\\n' "$${env}"; }; f`
  })
  return environment
}

function placeholderOf(ctx: StackContext, env: string): string {
  const placeholder = ctx.placeholders[env]
  if (!placeholder)
    throw new Error(`Missing placeholder for secret ${env}`)
  return placeholder
}

function collectPorts(config: ResolvedConfig): PublishedPort[] {
  const ports = Object.entries(config.services).flatMap(([service, { ports }]) =>
    ports.map(({ port, tailnet }) => parsePort(service, String(port), tailnet, !!config.tailscale)))
  const owners = new Map<number, string>()
  for (const { service, start, end } of ports) {
    for (let p = start; p <= end; p++) {
      const owner = owners.get(p)
      if (owner)
        throw new Error(`Port ${p} is published by both ${owner} and ${service}`)
      owners.set(p, service)
    }
  }
  return ports
}

function parsePort(service: string, port: string, tailnet: boolean, hasTailscale: boolean): PublishedPort {
  const [start, end] = port.split('-').map(Number)
  const parsed = { service, start: start!, end: end ?? start!, tailnet }
  if (parsed.end < parsed.start)
    throw new Error(`Invalid port range ${port} on service ${service}`)
  if (tailnet && parsed.end !== parsed.start)
    throw new Error(`Port ranges cannot be served on the tailnet (${port} on service ${service})`)
  if (tailnet && !hasTailscale)
    throw new Error(`Port ${port} on service ${service} sets \`tailnet\` but \`tailscale\` is not configured`)
  return parsed
}

function formatRange({ start, end }: PublishedPort): string {
  return start === end ? String(start) : `${start}-${end}`
}

function resolveVolume(root: string, volume: string): string {
  const [source = '', ...rest] = volume.split(':')
  if (!/^[.~/]/.test(source))
    return volume
  const path = source.startsWith('~') ? join(homedir(), source.slice(1)) : resolve(root, source)
  return [isAbsolute(path) ? path : resolve(path), ...rest].join(':')
}

/** Named volumes used by services must be declared at the top level. */
function namedVolumes(config: ResolvedConfig): string[] {
  const sources = Object.values(config.services).flatMap(s => s.volumes.map(v => v.split(':')[0] ?? ''))
  return [...new Set(sources.filter(source => /^\w[\w.-]*$/.test(source)))]
}

function slugify(path: string): string {
  return path.replace(/^\/+/, '').replace(/[^\w.-]+/g, '-')
}

/** Compose interpolates `$`; keep user and generated values literal. */
function escapeCompose(value: string): string {
  return value.replaceAll('$', '$$$$')
}
