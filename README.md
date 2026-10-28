# @antfu/dev-container

[![npm version][npm-version-src]][npm-version-href]
[![License][license-src]][license-href]

Run any agent, orchestrator or command in a network-caged container whose tokens never enter it.

`dev-container` turns a small config into a Docker Compose stack:

- **broker**: a [mitmproxy](https://mitmproxy.org) sidecar and the only way out of the cage. It holds the real tokens and swaps them in at egress, only towards the hosts each token is bound to.
- **your services**: any image or Dockerfile, on an `internal` network with no route to anything but the broker. They see placeholders, never the real values.
- **relay** (when you publish ports): forwards `127.0.0.1` ports on the host into the cage.
- **tailscale** (optional): serves chosen ports on your tailnet over HTTPS.

It has no opinion about what runs inside: [Paseo](https://github.com/getpaseo/paseo), opencode, Claude Code, pi, a hub like [agent-container](https://github.com/antfu/agent-container), or a shell.

## Quick start

```sh
npx @antfu/dev-container setup
```

`setup` asks for an image and the ports to publish, then writes:

- `dev-container.config.ts` with one idle `agent` service
- `.env` for plain settings
- `.env.secret` (mode `0600`), with empty `GH_TOKEN` and `NPM_TOKEN` entries to fill in
- `.gitignore` entries for `.env`, `.env.secret` and `.dev-container/`

Run it again any time; it only fills gaps and never overwrites existing values. Without a terminal, or when an AI agent runs it, it takes the defaults (`node:24`, no ports) and doesn't prompt; `--yes` does the same.

```sh
npx @antfu/dev-container up
npx @antfu/dev-container compose exec agent bash
# inside: $GH_TOKEN is a placeholder, yet `git push` and `gh` work
```

## How tokens stay out

On every `up`, each brokered secret gets a fresh random placeholder such as `dc-GH_TOKEN-3f9c0a1b2c3d4e5f`. Caged services receive the placeholder under the secret's variable names. The broker gets the real values and the rules, inline in its environment, so every `up` recreates it in step with the cage. For each request, the broker:

1. Finds placeholders in the request headers, including inside `Authorization: Basic`, which is how git sends credentials.
2. Replaces each one with the real value only when the request is HTTPS and its real upstream host matches the secret's `hosts`. It checks the CONNECT target, not the `Host` header, which the client controls.
3. Checks the secret's `rules` against the method and path, if it has any.
4. Answers `403` when a placeholder is sent to any other host, appears in a URL, is stale, or a rule denies the request. It logs a JSON line either way.

Caged services trust the broker's CA through environment variables only (`SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`). Nothing is installed into your image, so any image works. Only the public certificate is shared; the CA key stays in the broker.

## Config

```ts
export default defineConfig({
  // Compose project name; defaults to the directory name.
  name: 'my-agents',
  // Dotenv files consulted after the host environment; later files win.
  envFile: ['.env', '.env.secret'],
  // Host address published ports bind to.
  bind: '127.0.0.1',

  // github and npm are brokered automatically when their token is set.
  builtins: {
    npm: { from: { command: 'op read op://dev/npm/token' } }, // another source
    // github: false, // turn one off
  },

  // More brokered secrets: the cage only ever sees placeholders.
  secrets: [
    {
      env: 'ACME_KEY',
      hosts: ['api.acme.dev', '*.acme.dev:8443'],
      // Optional; first match wins, unmatched requests are allowed.
      rules: [{ action: 'deny', method: 'DELETE', path: '/v1/projects/**' }],
    },
  ],

  // 'open' (default) or an allowlist; secret hosts are always allowed.
  egress: { policy: 'allowlist', allow: ['registry.npmjs.org', '*.githubusercontent.com'] },

  // Optional sidecar; TS_AUTHKEY comes from the env unless `authKey` says otherwise.
  // A service can set its own `tailscale` to get a separate node.
  tailscale: { hostname: 'agents' },

  services: {
    agent: {
      image: 'ghcr.io/getpaseo/paseo:latest', // or build: './docker'
      command: ['…'],
      env: {
        NODE_ENV: 'development', // plain value
        ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY' }, // resolved on the host, visible in the cage
        PASEO_PASSWORD: { command: 'cat ~/.paseo-password' },
      },
      ports: [3000, '5170-5180', { port: 6767, tailnet: true }],
      volumes: ['./projects:/workspace'],
      persist: ['/home/paseo'], // kept in .dev-container/state/agent/
      // network: 'service:browser', // share another caged service's localhost
      control: true, // inject the control API URL and token
      compose: { mem_limit: '8g' }, // raw compose fields, deep-merged
    },
  },
})
```

### Builtin secrets

| Builtin | Detected from | Cage variables | Bound hosts |
| --- | --- | --- | --- |
| `github` | `GH_TOKEN`, then `GITHUB_TOKEN` | `GH_TOKEN`, `GITHUB_TOKEN`, plus a git credential helper | `api.github.com`, `uploads.github.com`, `github.com`, `codeload.github.com` |
| `npm` | `NPM_TOKEN` | `NPM_TOKEN` | `registry.npmjs.org` |

A builtin is on whenever its token is set in the shell or an `envFile`, and off with a warning otherwise. For npm, reference the variable from `.npmrc` as `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`, so the current placeholder is read on every run.

### Request rules

A brokered secret, builtins included, can limit which requests it is sent with. The broker checks `rules` in order whenever the secret's placeholder is in a request, and the first match wins. A request no rule matches is allowed, so end with `{ action: 'deny' }` to allow only what is listed:

```ts
export default defineConfig({
  builtins: {
    github: {
      rules: [
        { action: 'allow', method: ['GET', 'HEAD'] },
        { action: 'allow', path: '/repos/antfu/dev-container/**' },
        { action: 'deny' },
      ],
    },
  },
  // ...
})
```

`method` is one method or a list, and `path` is a glob: `*` matches within one segment, a `**` segment matches any number of them. An omitted field matches anything. Paths are matched case-insensitively, without the query string, after decoding and resolving `//`, `.` and `..`, so encoded variants of a denied path are denied too. A denied request gets `403` with [`DEV_CONTAINER_B5007`](./docs/errors/DEV_CONTAINER_B5007.md).

Git over HTTPS uses paths like `/<owner>/<repo>.git/git-receive-pack` on `github.com`, not the API paths on `api.github.com`; write rules for both if both are used.

### Secrets: brokered or cage-visible

| | `secrets` | service `env` reference |
| --- | --- | --- |
| Inside the cage | a placeholder | the real value |
| Sent to | only the bound `hosts` | wherever the process sends it |
| Use for | tokens agents only pass along: GitHub, npm, internal APIs | values a process must hold itself: model API keys, OAuth logins, an orchestrator's own password |

Both kinds come from the host: `{ env: 'NAME' }` (the shell environment, then each `envFile`) or `{ command: '…' }` (its trimmed stdout). A brokered secret defaults to `{ env: <its env name> }`. Every value is resolved before anything is written; a missing one fails the run and is named in the error. Resolved values go only to `0600` files in `.dev-container/env/`, never into `compose.yml`.

Agent CLIs use their tokens directly, so letting them hold those tokens costs nothing extra. Keep their logins across recreation with `persist`, e.g. `persist: ['/home/node/.claude']`.

### Ports, relay and tailnet

Caged services cannot publish ports themselves; that would need a non-internal network. Listed `ports` are published by the relay on `bind` (default `127.0.0.1`) and forwarded into the cage. Services must listen on `0.0.0.0`.

With `tailscale` configured, ports marked `tailnet: true` are also served as `https://<hostname>.<tailnet>.ts.net:<port>`. Use a number, as in `{ port: 8100, tailnet: 443 }`, to serve the port on a different tailnet port; it must be unique per node. That requires HTTPS certificates to be enabled for your tailnet. The sidecar is not an exit node or subnet router, so it gives the cage no route out.

To give a service its own MagicDNS name, set `tailscale` on the service. It gets its own sidecar, `tailscale-<service>`, with its own state in `.dev-container/state/tailscale-<service>/`. Services without one use the top-level node. A node without its own `authKey` uses the top-level one, which defaults to `TS_AUTHKEY`. Ports stay unique across the stack, because the relay also publishes them on the host, but a tailnet port such as 443 can repeat across nodes.

```ts
export default defineConfig({
  services: {
    paseo: { image: 'ghcr.io/getpaseo/paseo:latest', ports: [{ port: 6767, tailnet: true }], tailscale: { hostname: 'paseo' } },
    vi: { build: './vi', ports: [{ port: 5656, tailnet: true }], tailscale: { hostname: 'vi' } },
  },
})
```

### Persistence

Each `persist` path is bind-mounted from `.dev-container/state/<service>/<path>`. `dev-container` never deletes anything there; everything else in `.dev-container/` is regenerated on every run. The directory carries its own `.gitignore`.

The host directory starts empty and hides whatever the image had at that path. On Linux it is owned by your user, so the container user needs the same uid; `node` and `paseo` images use `1000`. To ship config into a persisted home, bake it into the image elsewhere and sync it on start; [`paseo-browser`](./examples/paseo-browser) shows an entrypoint that overwrites managed files, merges JSON and rewrites a marked TOML block, keeping whatever agents add.

### Shared network

`network: 'service:<name>'` puts a service in another caged service's network namespace, as compose's `network_mode` does, so the two reach each other on `localhost`. Its `ports` are published through that service. Only caged services can be joined, and only one level deep.

## CLI

```
dev-container setup [--yes]            scaffold the config, .env, .env.secret and .gitignore entries
dev-container generate                 write .dev-container/
dev-container up [compose up flags]    generate, then docker compose up -d --build --remove-orphans
dev-container compose <args...>        docker compose against the generated stack
dev-container serve [--host] [--port]  serve the control API
```

`compose` covers everything else: `down`, `logs -f agent`, `exec agent sh`, `restart broker`.

### Diagnostics

Every failure is a [nostics](https://github.com/vercel-labs/nostics) diagnostic with a stable code, the reason, a fix, and a [docs page](./docs/errors):

```
[DEV_CONTAINER_S2001] secret ACME_KEY: $ACME_KEY is not set in the environment or any envFile.
├▶ fix: Add `ACME_KEY=...` to .env.secret (or export it in the shell), or point the source at a `{ command }`.
╰▶ see: https://github.com/antfu/dev-container/blob/main/docs/errors/DEV_CONTAINER_S2001.md
```

Config and secret problems are all reported in one run. With `--json` or `DEV_CONTAINER_JSON=1`, each diagnostic is one JSON object per line on stderr. That is also the default when an AI agent runs the CLI ([std-env](https://github.com/unjs/std-env) detects Claude Code, Codex, Cursor, opencode, pi and others).

The broker answers blocked requests in the same format, with an `x-dev-container-diagnostic` header, so an agent inside the cage learns why a request failed and whether it can fix that itself or has to ask for a host-side change.

### Agent skill

```sh
npx skills add antfu/dev-container
```

The skill teaches coding agents the repair loop (`generate --json`, apply each `fix`, repeat) and how to handle broker blocks from inside the cage.

### Bring your own compose

`generate` writes a complete, self-contained `.dev-container/compose.yml` with absolute paths. Include it in your own compose file and add services to the cage next to it:

```yaml
include:
  - .dev-container/compose.yml
services:
  sidecar:
    image: redis
    networks: [caged]
```

Run `dev-container generate` before `docker compose up` so placeholders and env files are fresh.

## Control API

`dev-container serve` exposes the stack over HTTP for orchestrators and dashboards. It binds to `127.0.0.1:7357` by default (`control.port` in config), and every request needs the bearer token from `.dev-container/control-token`.

| Endpoint | |
| --- | --- |
| `GET /services` | state and health per service |
| `GET /stats` | CPU, memory, network, block IO, PIDs; `?stream=1` for SSE |
| `GET /services/{name}/logs` | `?tail=N`; `?follow=1` for SSE |
| `POST /services/{name}/restart` | restart one service |
| `POST /restart` | restart the stack |
| `GET /openapi.json` | the OpenAPI 3.1 document |

A service with `control: true` receives `DEV_CONTAINER_CONTROL_URL` and `DEV_CONTAINER_CONTROL_TOKEN` and reaches the server through the broker via `host.docker.internal`. On Linux, the host gateway is not loopback, so start the server with `serve --host 0.0.0.0` or with the docker bridge address.

To mount the API in your own server instead, use `createControlApp({ dir, token })`, which returns a Hono app.

## Using it with an orchestrator

Orchestrators run inside the cage like any other service, and their agents run as their child processes. See [`examples/`](./examples). In an example's directory, run `npx @antfu/dev-container setup` first: it keeps the example's config and creates the env files it reads.

- [`paseo`](./examples/paseo): the Paseo daemon with Claude Code, Codex and opencode, served on the tailnet.
- [`paseo-browser`](./examples/paseo-browser): Paseo plus a caged Chromium desktop you sign in to by hand, driven by agents over CDP. It also needs `BROWSER_PASSWORD` in `.env.secret`.
- [`opencode`](./examples/opencode): `opencode serve` on `127.0.0.1:4096`.
- [`pi`](./examples/pi): pi with an Anthropic subscription token.
- [`claude`](./examples/claude): Claude Code as a shell agent, with an egress allowlist.

Programmatic use goes through `loadConfig`, `resolveConfig`, `generate`, `up`, `compose`, `buildStack` and `createControlApp`.

## Limitations

- **Open egress is the default.** It stops tokens from leaving, not data. A caged process can still send anything it can read, including cage-visible secrets, to any host. With `egress: { policy: 'allowlist' }` the broker also refuses CONNECT tunnels to unlisted hosts, so raw TCP is held to the list too.
- **Request rules hold only for brokered secrets.** They decide whether a request may carry the secret, not what a caged process may do with credentials it holds itself, such as cookies in a signed-in browser.
- **Only request headers are rewritten, and responses are passed through as they are.** Secrets in request bodies or query strings are not brokered. An endpoint that echoes request headers back, such as a debugging echo service, hands the real value to the cage.
- **Clients must honour `HTTPS_PROXY`.** Anything else has no route out. Docker's embedded DNS can still resolve external names from the cage, which is a narrow side channel.
- **Placeholders change on every run.** Tools must read tokens from the environment. A token copied into a file inside the cage, such as a hand-written `.npmrc` value, goes stale on the next `up` and is refused.
- **OAuth logins are not brokered.** Subscription logins such as Claude Code's `.credentials.json` or Codex's `auth.json` live in the cage, refresh themselves, and persist with `persist`.
- **Orchestrators that start their own containers are not supported.** That needs the Docker socket, which would undo the cage.

## License

[MIT](./LICENSE.md) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@antfu/dev-container?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/@antfu/dev-container
[license-src]: https://img.shields.io/github/license/antfu/dev-container.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/dev-container/blob/main/LICENSE.md
