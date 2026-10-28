# dev-container

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
pnpm add -D dev-container
```

```ts
// dev-container.config.ts
import { defineConfig, presets } from 'dev-container'

export default defineConfig({
  secrets: [presets.github()],
  services: {
    agent: {
      image: 'node:24',
      command: ['sleep', 'infinity'],
      volumes: ['./:/workspace'],
    },
  },
})
```

```sh
GH_TOKEN=$(gh auth token) npx dev-container up
npx dev-container compose exec agent bash
# inside: $GH_TOKEN is a placeholder, yet `git push` and `gh` work
```

## How tokens stay out

On every `up`, each brokered secret gets a fresh random placeholder such as `dc-GH_TOKEN-3f9c0a1b2c3d4e5f`. Caged services receive the placeholder under the secret's variable names. The broker gets the real values and the rules, inline in its environment, so every `up` recreates it in step with the cage. For each request, the broker:

1. Finds placeholders in the request headers, including inside `Authorization: Basic`, which is how git sends credentials.
2. Replaces each one with the real value only when the request is HTTPS and its real upstream host matches the secret's `hosts`. It checks the CONNECT target, not the `Host` header, which the client controls.
3. Answers `403` when a placeholder is sent to any other host, appears in a URL, or is stale. It logs a JSON line either way.

Caged services trust the broker's CA through environment variables only (`SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`). Nothing is installed into your image, so any image works. Only the public certificate is shared; the CA key stays in the broker.

## Config

```ts
export default defineConfig({
  // Compose project name; defaults to the directory name.
  name: 'my-agents',
  // Dotenv file consulted after the host environment.
  envFile: 'secrets.env',
  // Host address published ports bind to.
  bind: '127.0.0.1',

  // Brokered: the cage only ever sees placeholders.
  secrets: [
    presets.github(), // GH_TOKEN / GITHUB_TOKEN, API + git over HTTPS
    presets.npm({ from: { command: 'op read op://dev/npm/token' } }),
    { env: 'ACME_KEY', hosts: ['api.acme.dev', '*.acme.dev:8443'] },
  ],

  // 'open' (default) or an allowlist; secret hosts are always allowed.
  egress: { policy: 'allowlist', allow: ['registry.npmjs.org', '*.githubusercontent.com'] },

  // Optional sidecar; TS_AUTHKEY comes from the env unless `authKey` says otherwise.
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
      control: true, // inject the control API URL and token
      compose: { mem_limit: '8g' }, // raw compose fields, deep-merged
    },
  },
})
```

### Secrets: brokered or cage-visible

| | `secrets` | service `env` reference |
| --- | --- | --- |
| Inside the cage | a placeholder | the real value |
| Sent to | only the bound `hosts` | wherever the process sends it |
| Use for | tokens agents only pass along: GitHub, npm, internal APIs | values a process must hold itself: model API keys, OAuth logins, an orchestrator's own password |

Both kinds come from the host: `{ env: 'NAME' }` (the host environment, then `envFile`) or `{ command: '…' }` (its trimmed stdout). A brokered secret defaults to `{ env: <its env name> }`. Every value is resolved before anything is written; a missing one fails the run and is named in the error. Resolved values go only to `0600` files in `.dev-container/env/`, never into `compose.yml`.

Agent CLIs use their tokens directly, so letting them hold those tokens costs nothing extra. Keep their logins across recreation with `persist`, e.g. `persist: ['/home/node/.claude']`.

### Ports, relay and tailnet

Caged services cannot publish ports themselves; that would need a non-internal network. Listed `ports` are published by the relay on `bind` (default `127.0.0.1`) and forwarded into the cage. Services must listen on `0.0.0.0`.

With `tailscale` configured, ports marked `tailnet: true` are also served as `https://<hostname>.<tailnet>.ts.net:<port>`. That requires HTTPS certificates to be enabled for your tailnet. The sidecar is not an exit node or subnet router, so it gives the cage no route out.

### Persistence

Each `persist` path is bind-mounted from `.dev-container/state/<service>/<path>`. `dev-container` never deletes anything there; everything else in `.dev-container/` is regenerated on every run. The directory carries its own `.gitignore`.

The host directory starts empty and hides whatever the image had at that path. On Linux it is owned by your user, so the container user needs the same uid; `node` and `paseo` images use `1000`.

## CLI

```
dev-container generate                 write .dev-container/
dev-container up [compose up flags]    generate, then docker compose up -d --build --remove-orphans
dev-container compose <args...>        docker compose against the generated stack
dev-container serve [--host] [--port]  serve the control API
```

`compose` covers everything else: `down`, `logs -f agent`, `exec agent sh`, `restart broker`.

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

Orchestrators run inside the cage like any other service, and their agents run as their child processes. See [`examples/`](./examples):

- [`paseo`](./examples/paseo): the Paseo daemon with Claude Code, Codex and opencode, served on the tailnet.
- [`opencode`](./examples/opencode): `opencode serve` on `127.0.0.1:4096`.
- [`pi`](./examples/pi): pi with an Anthropic subscription token.
- [`claude`](./examples/claude): Claude Code as a shell agent, with an egress allowlist.

Programmatic use goes through `loadConfig`, `resolveConfig`, `generate`, `up`, `compose`, `buildStack` and `createControlApp`.

## Limitations

- **Open egress is the default.** It stops tokens from leaving, not data. A caged process can still send anything it can read, including cage-visible secrets, to any host. With `egress: { policy: 'allowlist' }` the broker also refuses CONNECT tunnels to unlisted hosts, so raw TCP is held to the list too.
- **Only request headers are rewritten, and responses are passed through as they are.** Secrets in request bodies or query strings are not brokered. An endpoint that echoes request headers back, such as a debugging echo service, hands the real value to the cage.
- **Clients must honour `HTTPS_PROXY`.** Anything else has no route out. Docker's embedded DNS can still resolve external names from the cage, which is a narrow side channel.
- **Placeholders change on every run.** Tools must read tokens from the environment. A token copied into a file inside the cage, such as a hand-written `.npmrc` value, goes stale on the next `up` and is refused.
- **OAuth logins are not brokered.** Subscription logins such as Claude Code's `.credentials.json` or Codex's `auth.json` live in the cage, refresh themselves, and persist with `persist`.
- **Orchestrators that start their own containers are not supported.** That needs the Docker socket, which would undo the cage.

## License

[MIT](./LICENSE.md) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/dev-container?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/dev-container
[license-src]: https://img.shields.io/github/license/antfu/dev-container.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/dev-container/blob/main/LICENSE.md
