import type { BuiltinName } from './builtins'
import { dirname } from 'node:path'
import process from 'node:process'
import { createConfigLoader } from 'unconfig'
import { z } from 'zod'
import { diagnostics } from './diagnostics'

const RESERVED_SERVICES = ['broker', 'relay', 'tailscale']
/** Per-service tailscale sidecars are named `tailscale-<service>`. */
const RESERVED_PREFIX = 'tailscale-'
const DEFAULT_AUTH_KEY = { env: 'TS_AUTHKEY' }
const RESERVED_VOLUMES = new Set(['ca', 'broker-ca'])

const EnvName = z.string().regex(/^[A-Z_]\w*$/i, 'must be a valid environment variable name')

/** Matches `host`, `*.host` (subdomains only) and either with an optional `:port`. */
const HostPattern = z.string().regex(/^(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i, 'must be `host`, `*.host`, optionally with `:port`')

const SecretSource = z.union([
  z.strictObject({ env: EnvName }),
  z.strictObject({ command: z.string().min(1) }),
])

/** A cage-visible reference; `optional` leaves the variable out instead of failing when it is unset. */
const EnvReference = z.union([
  z.strictObject({ env: EnvName, optional: z.boolean().optional() }),
  z.strictObject({ command: z.string().min(1) }),
])

const Method = z.string().regex(/^[a-z]+$/i, 'must be an HTTP method').transform(method => method.toUpperCase())

/** One request rule for a brokered secret; omitted fields match anything. */
const RequestRule = z.strictObject({
  action: z.enum(['allow', 'deny']),
  method: z.union([Method, z.array(Method).min(1)]).transform(method => typeof method === 'string' ? [method] : method).optional(),
  /** `*` matches within one segment, a `**` segment matches any number of them. */
  path: z.string().regex(/^\/[^?#]*$/, 'must start with `/` and have no query or fragment').optional(),
})

/** Checked in order whenever the secret is sent; the first match wins, and a request no rule matches is allowed. */
const RequestRules = z.array(RequestRule).default([])

const Secret = z.strictObject({
  /** Variable that holds the placeholder inside the cage. */
  env: EnvName,
  /** Extra variables in the cage that receive the same placeholder. */
  aliases: z.array(EnvName).default([]),
  /** The only hosts the real value is ever sent to. */
  hosts: z.array(HostPattern).min(1),
  /** Where the real value comes from on the host. Defaults to `{ env: <env> }`. */
  from: SecretSource.optional(),
  /** Configure a git credential helper that answers with the placeholder. */
  git: z.strictObject({ host: z.string(), username: z.string() }).optional(),
  rules: RequestRules,
})

const PortRange = z.union([
  z.number().int().min(1).max(65535),
  z.string().regex(/^\d+(?:-\d+)?$/, 'must be `port` or `start-end`'),
])

const Port = z.union([
  PortRange,
  // `true` serves the port on the tailnet as is; a number serves it on that tailnet port instead.
  z.strictObject({ port: PortRange, tailnet: z.union([z.boolean(), z.number().int().min(1).max(65535)]).default(false) }),
]).transform(port => typeof port === 'object' ? port : { port, tailnet: false })

const Tailscale = z.strictObject({
  hostname: z.string().min(1),
  authKey: SecretSource.optional(),
})

const Build = z.union([
  z.string(),
  z.strictObject({ context: z.string(), dockerfile: z.string().optional() }),
])

const Service = z.strictObject({
  image: z.string().optional(),
  build: Build.optional(),
  command: z.union([z.string(), z.array(z.string())]).optional(),
  /** Plain values, or secret references that are deliberately visible inside the cage. */
  env: z.record(EnvName, z.union([z.string(), EnvReference])).default({}),
  ports: z.array(Port).default([]),
  volumes: z.array(z.string().refine(volume => !RESERVED_VOLUMES.has(volume.split(':')[0] ?? ''), 'uses a volume name reserved by dev-container')).default([]),
  /** `service:<name>` joins another caged service's network namespace, so both share `localhost`. */
  network: z.string().regex(/^service:[a-z0-9][\w-]*$/, 'must be `service:<name>`').optional(),
  /** Container paths persisted to `.dev-container/state/<service>/`. */
  persist: z.array(z.string().startsWith('/')).default([]),
  /** Inject the control server URL and token. */
  control: z.boolean().default(false),
  /** Raw compose service fields, deep-merged over the generated service. */
  compose: z.record(z.string(), z.json()).optional(),
  /** Serve this service's `tailnet` ports from its own node instead of the top-level one. */
  tailscale: Tailscale.optional(),
  /** Commit identity for the git inside the container; signing is the `gpg` builtin. */
  git: z.strictObject({
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
  }).optional(),
}).refine(service => service.image || service.build, 'requires `image` or `build`')

const Builtin = z.union([z.literal(false), z.strictObject({ from: SecretSource.optional(), rules: RequestRules })])

/** Not a brokered secret: the key is piped into `gpg --import` inside each running service after `up`, never stored in its environment. */
const Gpg = z.union([
  z.literal('auto'),
  z.literal(false),
  z.strictObject({
    /** An armored key, or base64 of one, without a passphrase. Defaults to `GPG_PRIVATE_KEY`; unset means off. */
    privateKey: SecretSource.optional(),
    /** The matching public key, imported too. Defaults to `GPG_PUBLIC_KEY`. */
    publicKey: SecretSource.optional(),
    /** The container user that owns the keyring and git config. Defaults to the image's user. */
    user: z.string().optional(),
    /** Only these services; by default every service that has gpg installed. */
    services: z.array(z.string()).optional(),
  }),
])

const Egress = z.discriminatedUnion('policy', [
  z.strictObject({ policy: z.literal('open') }),
  z.strictObject({ policy: z.literal('allowlist'), allow: z.array(HostPattern).default([]) }),
])

const Config = z.strictObject({
  /** Compose project name. Defaults to the project directory name. */
  name: z.string().regex(/^[a-z0-9][\w-]*$/).optional(),
  /** Dotenv files consulted after the host environment for `{ env }` sources; later files win. Defaults to `.env` when present; a listed file must exist. */
  envFile: z.union([z.string(), z.array(z.string())]).transform(files => typeof files === 'string' ? [files] : files).optional(),
  /**
   * Dotenv files whose every variable is brokered: the cage gets a placeholder, and the broker swaps
   * in the real value only towards the secret's bound hosts. A variable no builtin or `secrets` entry
   * binds to a host is never sent anywhere. Also consulted for `{ env }` sources, after `envFile`.
   * Defaults to `.env.secret` when present; a listed file must exist.
   * Variables that a `{ env }` source reads, such as the Tailscale auth key, are not brokered.
   */
  envSecretFile: z.union([z.string(), z.array(z.string())]).transform(files => typeof files === 'string' ? [files] : files).optional(),
  /** Host address published ports bind to. */
  bind: z.string().default('127.0.0.1'),
  /** `github` and `npm` are brokered automatically when their token is set; `false` turns one off, `from` overrides its source, `rules` limits its requests. */
  builtins: z.strictObject({
    ...{ github: Builtin.optional(), npm: Builtin.optional() } satisfies Record<BuiltinName, z.ZodType>,
    /** Signs commits inside the services: `'auto'` imports `GPG_PRIVATE_KEY` (and `GPG_PUBLIC_KEY`) when set. Off by default. */
    gpg: Gpg.optional(),
  }).default({}),
  secrets: z.array(Secret).default([]),
  /** `dev-container sync` for a stack kept in a git checkout on an always-on host. */
  sync: z.strictObject({
    /** Pull, rebuild and restart on its own: the daemon runs `sync` every `interval` seconds. Off, an upgrade only runs when asked, from `sync` or the monitor. */
    autoUpgrade: z.boolean().default(false),
    /** Seconds between the daemon's automatic upgrades. */
    interval: z.number().int().min(10).default(300),
    /** Shell commands run from the project root before `up`, such as `pnpm install --frozen-lockfile`. */
    commands: z.array(z.string()).default([]),
  }).default({ autoUpgrade: false, interval: 300, commands: [] }),
  egress: Egress.default({ policy: 'open' }),
  /** The default node, for services without their own `tailscale`. */
  tailscale: Tailscale.optional(),
  control: z.strictObject({
    port: z.number().int().default(7357),
    /** Address `dev-container serve` binds to. */
    host: z.string().default('127.0.0.1'),
    /**
     * Serve the control API and its monitor on the tailnet from a node of its own, as
     * `https://<hostname>.<tailnet>.ts.net`. The sidecar reaches the host through `host.docker.internal`,
     * so on Linux `host` has to be an address the docker gateway can reach, such as `0.0.0.0`.
     */
    tailscale: Tailscale.optional(),
    /** The tailnet port the monitor is served on. */
    tailnetPort: z.number().int().min(1).max(65535).default(443),
  }).default({ port: 7357, host: '127.0.0.1', tailnetPort: 443 }),
  services: z.record(z.string().regex(/^[a-z0-9][\w-]*$/), Service)
    .refine(services => Object.keys(services).length > 0, 'at least one service is required')
    .refine(
      services => Object.keys(services).every(name => !RESERVED_SERVICES.includes(name) && !name.startsWith(RESERVED_PREFIX)),
      `service names ${RESERVED_SERVICES.join(', ')} and ${RESERVED_PREFIX}* are reserved`,
    ),
})

export type UserConfig = z.input<typeof Config>
export type ResolvedConfig = z.output<typeof Config>
export type SecretConfig = z.input<typeof Secret>
export type ResolvedSecret = z.output<typeof Secret>
export type ResolvedService = z.output<typeof Service>
export type SecretSourceConfig = z.output<typeof SecretSource>
export type JsonValue = z.output<ReturnType<typeof z.json>>

export interface TailscaleNode {
  /** Compose service name of the sidecar; also names its state, env and serve files. */
  name: string
  hostname: string
  authKey: SecretSourceConfig
  /** Config path of the node, for diagnostics. */
  label: string
  /** Services whose `tailnet` ports this node serves. */
  services: string[]
  /** Set on the control node: the tailnet port it serves and the host port it forwards to. */
  control?: { tailnetPort: number, port: number }
}

/** The top-level node first, then one per service with its own `tailscale`; auth keys fall back to the top-level one. */
export function tailscaleNodes(config: ResolvedConfig): TailscaleNode[] {
  const fallback = config.tailscale?.authKey ?? DEFAULT_AUTH_KEY
  const entries = Object.entries(config.services)
  const nodes: TailscaleNode[] = entries.flatMap(([service, { tailscale }]) => tailscale
    ? [{ name: `${RESERVED_PREFIX}${service}`, hostname: tailscale.hostname, authKey: tailscale.authKey ?? fallback, label: `services.${service}.tailscale`, services: [service] }]
    : [])
  if (config.control.tailscale) {
    const { tailscale, tailnetPort, port } = config.control
    nodes.push({ name: `${RESERVED_PREFIX}control`, hostname: tailscale.hostname, authKey: tailscale.authKey ?? fallback, label: 'control.tailscale', services: [], control: { tailnetPort, port } })
  }
  if (config.tailscale) {
    const services = entries.filter(([, { tailscale }]) => !tailscale).map(([service]) => service)
    nodes.unshift({ name: 'tailscale', hostname: config.tailscale.hostname, authKey: fallback, label: 'tailscale', services })
  }
  return nodes
}

export function defineConfig(config: UserConfig): UserConfig {
  return config
}

/**
 * Validates a config. Throws an `AggregateError` of `DEV_CONTAINER_C1002`
 * diagnostics, one per problem, so every mistake is reported at once.
 */
export function resolveConfig(config: UserConfig, file?: string): ResolvedConfig {
  const result = Config.safeParse(config)
  if (!result.success) {
    const issues = result.error.issues.map(issue => diagnostics.DEV_CONTAINER_C1002({
      path: issue.path.map(String).join('.'),
      message: issue.message,
      sources: file ? [file] : undefined,
    }))
    throw new AggregateError(issues, 'Invalid dev-container config')
  }
  return result.data
}

/** Loads `dev-container.config.*`; `root` is the directory containing it. */
export async function loadConfig(cwd = process.cwd()): Promise<{ config: ResolvedConfig, root: string, file: string }> {
  const loader = createConfigLoader<UserConfig>({
    sources: [{ files: 'dev-container.config' }],
    cwd,
  })
  const { config, sources } = await loader.load()
  const [file] = sources
  if (!file)
    throw diagnostics.DEV_CONTAINER_C1001({ cwd })
  return { config: resolveConfig(config, file), root: dirname(file), file }
}
