import { dirname } from 'node:path'
import process from 'node:process'
import { createConfigLoader } from 'unconfig'
import { z } from 'zod'

const RESERVED_SERVICES = ['broker', 'relay', 'tailscale']

const EnvName = z.string().regex(/^[A-Z_]\w*$/i, 'must be a valid environment variable name')

/** Matches `host`, `*.host` (subdomains only) and either with an optional `:port`. */
const HostPattern = z.string().regex(/^(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i, 'must be `host`, `*.host`, optionally with `:port`')

const SecretSource = z.union([
  z.strictObject({ env: EnvName }),
  z.strictObject({ command: z.string().min(1) }),
])

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
})

const PortRange = z.union([
  z.number().int().min(1).max(65535),
  z.string().regex(/^\d+(?:-\d+)?$/, 'must be `port` or `start-end`'),
])

const Port = z.union([
  PortRange,
  z.strictObject({ port: PortRange, tailnet: z.boolean().default(false) }),
]).transform(port => typeof port === 'object' ? port : { port, tailnet: false })

const Build = z.union([
  z.string(),
  z.strictObject({ context: z.string(), dockerfile: z.string().optional() }),
])

const Service = z.strictObject({
  image: z.string().optional(),
  build: Build.optional(),
  command: z.union([z.string(), z.array(z.string())]).optional(),
  /** Plain values, or secret references that are deliberately visible inside the cage. */
  env: z.record(EnvName, z.union([z.string(), SecretSource])).default({}),
  ports: z.array(Port).default([]),
  volumes: z.array(z.string()).default([]),
  /** Container paths persisted to `.dev-container/state/<service>/`. */
  persist: z.array(z.string().startsWith('/')).default([]),
  /** Inject the control server URL and token. */
  control: z.boolean().default(false),
  /** Raw compose service fields, deep-merged over the generated service. */
  compose: z.record(z.string(), z.json()).optional(),
}).refine(service => service.image || service.build, 'requires `image` or `build`')

const Egress = z.discriminatedUnion('policy', [
  z.strictObject({ policy: z.literal('open') }),
  z.strictObject({ policy: z.literal('allowlist'), allow: z.array(HostPattern).default([]) }),
])

const Config = z.strictObject({
  /** Compose project name. Defaults to the project directory name. */
  name: z.string().regex(/^[a-z0-9][\w-]*$/).optional(),
  /** Dotenv file consulted after the host environment for `{ env }` sources. */
  envFile: z.string().optional(),
  /** Host address published ports bind to. */
  bind: z.string().default('127.0.0.1'),
  secrets: z.array(Secret).default([]),
  egress: Egress.default({ policy: 'open' }),
  tailscale: z.strictObject({
    hostname: z.string().min(1),
    authKey: SecretSource.default({ env: 'TS_AUTHKEY' }),
  }).optional(),
  control: z.strictObject({ port: z.number().int().default(7357) }).default({ port: 7357 }),
  services: z.record(z.string().regex(/^[a-z0-9][\w-]*$/), Service)
    .refine(services => Object.keys(services).length > 0, 'at least one service is required')
    .refine(services => !RESERVED_SERVICES.some(name => name in services), `service names ${RESERVED_SERVICES.join(', ')} are reserved`),
})

export type UserConfig = z.input<typeof Config>
export type ResolvedConfig = z.output<typeof Config>
export type SecretConfig = z.input<typeof Secret>
export type ResolvedService = z.output<typeof Service>
export type SecretSourceConfig = z.output<typeof SecretSource>
export type JsonValue = z.output<ReturnType<typeof z.json>>

export function defineConfig(config: UserConfig): UserConfig {
  return config
}

export function resolveConfig(config: UserConfig): ResolvedConfig {
  const result = Config.safeParse(config)
  if (!result.success)
    throw new Error(`Invalid dev-container config:\n${z.prettifyError(result.error)}`)
  return result.data
}

/** Loads `dev-container.config.*`; `root` is the directory containing it. */
export async function loadConfig(cwd = process.cwd()): Promise<{ config: ResolvedConfig, root: string }> {
  const loader = createConfigLoader<UserConfig>({
    sources: [{ files: 'dev-container.config' }],
    cwd,
  })
  const { config, sources } = await loader.load()
  if (!sources[0])
    throw new Error(`No dev-container.config.* found from ${cwd}`)
  return { config: resolveConfig(config), root: dirname(sources[0]) }
}
