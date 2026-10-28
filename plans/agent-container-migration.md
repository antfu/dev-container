# Migrating agent-container onto dev-container

Goal: [agent-container](https://github.com/antfu/agent-container) keeps the hub, the workbench image and the integrations. It hands the broker, the cage, port publishing, Tailscale and container control to `dev-container`. Its `compose.yml` and `containers/broker/` go away, and a `dev-container.config.ts` replaces them.

The file references below are to agent-container at `f35c7d0`.

## What changes for free

| Today | With dev-container |
| --- | --- |
| `inject.py` matches on `pretty_host`, which comes from the client-sent `Host` header (plan 001, P1) | Matched against the CONNECT target and the upstream address; a placeholder to any other host gets a 403 |
| `caged` is a plain bridge, and anything that ignores `HTTP(S)_PROXY` reaches the internet (plan 007) | `caged` is `internal: true`; ports are published by the relay sidecar, so Docker Desktop keeps working |
| Fixed dummy `dummy-broker-will-swap` | Random placeholder per `up`, so a stale or leaked one is refused |
| The mitm CA private key is mounted into the workbench (`mitm-certs:/certs:ro`) | Only the public certificate is shared |
| The broker healthcheck only checks that the CA file exists | It checks the CA file and that the proxy port accepts connections |
| No broker tests (plan 002) | Policy unit tests plus a Docker e2e test in dev-container's CI |

## Mapping

### Broker and secrets

- **Remove `containers/broker/`** (Dockerfile, entrypoint.sh, inject.py) and the `broker` service in `compose.yml:299-326`.
- **Map the GitHub token** with `presets.github({ from: { env: 'BROKER_SECRET_GITHUB_TOKEN' } })`. That keeps the existing `config/secrets.env` key. Pass the file as `envFile: 'config/secrets.env'`.
- **Delete the dummy-token plumbing**, which dev-container now provides as `GH_TOKEN`/`GITHUB_TOKEN` placeholders plus a `GIT_CONFIG_*` credential helper:
  - `GH_TOKEN`/`GITHUB_TOKEN` in `compose.yml:110-111`
  - the git credential helpers in `containers/workbench/entrypoint.sh:65-68`
- **Delete the CA plumbing** in favour of dev-container's environment:
  - the CA env block in `compose.yml:100-104`
  - `entrypoint.sh:21-35`, both the exports and the persisted `http.sslCAInfo` / npm `cafile`
  - The CA path moves from `/certs/mitmproxy-ca-cert.pem` to `/etc/dev-container/ca/mitmproxy-ca-cert.pem`. Grep for `/certs/` (`Dockerfile:96` creates the directory).
- **Delete the proxy defaults** in `entrypoint.sh:40-47` and `compose.yml:84-87`.
  - `NO_PROXY` now lists every caged service name.
  - Lowercase variants are set as well, so `exec` shells see them too.
- **Model API keys** (`compose.yml:186-194`) become cage-visible references, e.g. `ANTHROPIC_API_KEY: { env: 'WORKBENCH_SECRET_ANTHROPIC_API_KEY' }`. `CODESERVER_PASSWORD` and `HUB_PASSWORD` work the same way, with `{ env: 'WORKBENCH_SECRET_PASSWORD' }`.
- **`scripts/env-schema.ts`** keeps its prefixes. `BROKER_SECRET_*` still means "brokered"; it is just read by dev-container now.

### Workbench service

| `compose.yml` | `services.workbench` |
| --- | --- |
| `build` + `args` from `versions.env` | `build: { context: '.', dockerfile: 'containers/workbench/Dockerfile' }`, with build args via `compose: { build: { args } }` |
| `environment` (non-secret) | `env` plain values |
| `volumes` under `./config`, `./state`, `./cache` | `volumes`, unchanged host paths |
| `restart: unless-stopped` | the default |
| `container_name: workbench` | drop it, or set it via `compose`; scripts that `docker exec workbench` should use `dev-container compose exec workbench` |

Candidates for `persist` instead of hand-written bind mounts: `/home/dev/.local/share/opencode`, `/home/dev/.agents/skills`, `/home/dev/.claude`. Moving them changes their host location to `.dev-container/state/workbench/...`, so keep them as `volumes` unless a one-off state move is acceptable.

### Ports

agent-container publishes host ports that differ from the container ports (`14096→8100`, `14097→4096`, `14098→8080`). The relay publishes each port under the same number on both sides. Pick one:

1. Make the hub, opencode and code-server listen on the published numbers inside the container. This needs no dev-container change.
2. Add a `{ port, host }` mapping to dev-container's `ports`. This is a small relay and compose change.

Option 1 is preferred, since it keeps the core minimal. The dev-server ranges (`3000-3010`, `4321`, `5170-5180`, `6006`, `8000-8001`) map directly.

### Tailscale

- Replace `make tailscale-up`, which runs host-side `tailscale serve` for every published port, with `tailscale: { hostname }` and `tailnet: true` on the hub, opencode and code-server ports. `TS_AUTHKEY` comes from `config/secrets.env` via `authKey: { env: 'WORKBENCH_SECRET_TS_AUTHKEY' }`.
- The node becomes its own tailnet machine. The hub moves from `https://<host>.ts.net/` to `https://<hostname>.ts.net:<port>`. Serving the hub at `:443` would need a `root` option that dev-container does not have yet.

### Hub touchpoints

- `server/api/system/restart.post.ts`, `services.get.ts`, `status.get.ts`: container-level restarts and resource stats come from the control API. Set `control: true` on the workbench and read `DEV_CONTAINER_CONTROL_URL` / `DEV_CONTAINER_CONTROL_TOKEN`. Restarts of supervisord programs inside the container stay with the hub.
- `server/utils/gh.ts`, `project-add.ts`, `skills-add.ts`, `pr-*.ts`: no change. They already rely on the broker swapping the token.
- `server/utils/versions.ts`, `dev-stub.ts`, `__fixtures__/system.ts`: the mitmproxy version now comes from dev-container's broker image instead of `versions.env`.
- `server/utils/terminals.ts:36`: terminals still inherit `process.env`. That is fine now, because the GitHub token there is a placeholder.
- `api/projects/[name]/icon.get.ts:6`: drop the stale "broker allowlist" comment.

### Makefile and docs

- `build` / `up` become `dev-container up`.
- `logs`, `restart`, `shell` and `doctor` become `dev-container compose …`.
- `reset` currently deletes the `mitm-certs` volume. It becomes `dev-container compose down --volumes`, which drops `broker-ca` and `ca`.
- README "Every git/`gh` operation fails": the token check becomes `dev-container compose exec broker python -c '…'` with `os.environ["DEV_CONTAINER_SECRET_GH_TOKEN"]`.
- Fix the stale claims about `internal: true`, the allowlist and npm injection in `AGENTS.md` (lines 25, 199, 613) and in the `compose.yml` header. Once migrated they are simply true (cage) or gone.

## Steps (one PR each)

1. Add `dev-container` and a `dev-container.config.ts` that reproduces today's stack, with the port numbers aligned (option 1 above). Keep `compose.yml` working in parallel.
2. Switch the Makefile targets and docs to `dev-container`; delete `compose.yml` and `containers/broker/`.
3. Remove the dummy-token, CA and proxy plumbing from the workbench entrypoint and Dockerfile.
4. Move model keys and passwords to cage-visible `env` references.
5. Replace `make tailscale-up` with the sidecar.
6. Point the hub's system status and restart endpoints at the control API.
7. Rotate the GitHub token. Plan 001 recommends it after the `Host` header hole is closed.

## Open questions

- Is a `{ port, host }` mapping worth adding to dev-container, or should agent-container align its ports?
- Do users depend on host-mode Tailscale (`tailscale serve` on the host) badly enough to justify more than the sidecar?
- Should the hub at `:443` on the tailnet become a dev-container `root` option?
