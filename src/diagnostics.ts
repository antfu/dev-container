import { defineDiagnostics } from 'nostics'

export const DOCS_BASE = 'https://github.com/antfu/dev-container/blob/main/docs/errors'

/**
 * Every user-facing failure. Codes are stable: `C` config, `S` secrets,
 * `N` network/ports/volumes, `D` docker and the control API. Broker codes
 * (`B`) live in `services/broker/rules.py` and share the docs directory.
 */
export const diagnostics = /* #__PURE__ */ defineDiagnostics({
  docsBase: code => `${DOCS_BASE}/${code}.md`,
  codes: {
    DEV_CONTAINER_C1001: {
      why: (p: { cwd: string }) => `No dev-container.config.* found in ${p.cwd} or any parent directory.`,
      fix: 'Run `npx @antfu/dev-container setup` to create one, or run the command from the project directory.',
    },
    DEV_CONTAINER_C1002: {
      why: (p: { path: string, message: string }) => `Invalid config at \`${p.path || '<root>'}\`: ${p.message}.`,
      fix: 'Edit that field in dev-container.config.ts to match the schema in the README, then re-run.',
      data: (p: { path: string }) => ({ path: p.path }),
    },
    DEV_CONTAINER_C1003: {
      why: (p: { env: string }) => `More than one secret claims the variable ${p.env}.`,
      fix: (p: { builtin?: string }) => p.builtin
        ? `Remove the custom secret, or turn the builtin off with \`builtins: { ${p.builtin}: false }\`.`
        : 'Give each secret its own `env` and `aliases`.',
    },
    DEV_CONTAINER_S2001: {
      why: (p: { label: string, env: string }) => `${p.label}: $${p.env} is not set in the environment or any envFile.`,
      fix: (p: { env: string }) => `Add \`${p.env}=...\` to .env.secret (or export it in the shell), or point the source at a \`{ command }\`.`,
    },
    DEV_CONTAINER_S2002: {
      why: (p: { builtin: string, envs: string[] }) => `Builtin secret \`${p.builtin}\` is off: none of ${p.envs.map(e => `$${e}`).join(', ')} is set.`,
      fix: (p: { builtin: string, envs: string[] }) => `Set ${p.envs[0]} in .env.secret to enable it, or silence this with \`builtins: { ${p.builtin}: false }\`.`,
    },
    DEV_CONTAINER_S2003: {
      why: (p: { label: string, command: string, reason: string }) => `${p.label}: \`${p.command}\` ${p.reason}.`,
      fix: 'Run the command in a shell on the host until it prints the value, or switch the source to `{ env }`.',
    },
    DEV_CONTAINER_S2004: {
      why: (p: { key: string }) => `The value of ${p.key} contains a single quote or a newline, which compose env files cannot carry literally.`,
      fix: 'Store a value without single quotes or newlines, e.g. base64-encode it and decode it inside the container.',
    },
    DEV_CONTAINER_S2005: {
      why: (p: { path: string }) => `envFile ${p.path} does not exist.`,
      fix: 'Create it (`npx @antfu/dev-container setup` writes .env and .env.secret) or remove it from `envFile`.',
    },
    DEV_CONTAINER_S2006: {
      why: (p: { reason: string }) => `Could not prefill GH_TOKEN: the gh CLI ${p.reason}.`,
      fix: 'Run `gh auth login` and then `npx @antfu/dev-container setup` again, or paste a token into GH_TOKEN in .env.secret.',
    },
    DEV_CONTAINER_N3001: {
      why: (p: { port: number, first: string, second: string }) => `Port ${p.port} is published by both ${p.first} and ${p.second}.`,
      fix: 'Publish each host port from one service only; change one of the `ports` entries.',
    },
    DEV_CONTAINER_N3002: {
      why: (p: { port: string, service: string }) => `Invalid port range ${p.port} on service ${p.service}.`,
      fix: 'Use a port between 1 and 65535, or `start-end` with start <= end.',
    },
    DEV_CONTAINER_N3003: {
      why: (p: { port: string, service: string, max: number }) => `Port range ${p.port} on service ${p.service} spans more than ${p.max} ports.`,
      fix: 'Publish only the ports the service listens on; split very wide ranges.',
    },
    DEV_CONTAINER_N3004: {
      why: (p: { port: string, service: string }) => `Port range ${p.port} on service ${p.service} cannot be served on the tailnet.`,
      fix: 'Mark single ports with `tailnet: true`, one entry per port.',
    },
    DEV_CONTAINER_N3005: {
      why: (p: { port: string, service: string }) => `Port ${p.port} on service ${p.service} sets \`tailnet\` but \`tailscale\` is not configured.`,
      fix: 'Add `tailscale: { hostname: \'...\' }` and TS_AUTHKEY to .env.secret, or drop `tailnet: true`.',
    },
    DEV_CONTAINER_N3006: {
      why: (p: { service: string, paths: string[] }) => `Persist paths of service ${p.service} map to the same state directory: ${p.paths.join(', ')}.`,
      fix: 'Persist one of the paths\' common parent instead, or rename one of them.',
    },
    DEV_CONTAINER_D4001: {
      why: (p: { docker: string }) => `The docker CLI (\`${p.docker}\`) was not found.`,
      fix: 'Install Docker (with the compose plugin) and make sure `docker` is on PATH.',
    },
    DEV_CONTAINER_D4002: {
      why: (p: { output: string }) => `docker failed: ${p.output}`,
      fix: 'Check that the stack is up (`dev-container up`) and the service name exists; the docker output above names the problem.',
    },
    DEV_CONTAINER_D4003: {
      why: 'Missing or wrong bearer token for the control API.',
      fix: 'Send `Authorization: Bearer <token>` with the token from .dev-container/control-token (or $DEV_CONTAINER_CONTROL_TOKEN in the cage).',
    },
    DEV_CONTAINER_D4004: {
      why: (p: { message: string }) => `Invalid control API request: ${p.message}`,
      fix: 'Compare the request with GET /openapi.json.',
    },
  },
})
