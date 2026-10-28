---
name: dev-container
description: Configure, run and repair dev-container stacks, which are network-caged containers whose tokens are swapped in by an egress broker. Use when a project has a dev-container.config.*file, when a command prints DEV_CONTAINER_* diagnostics, or when an HTTP request inside a container fails with 403 and an `x-dev-container-diagnostic` header.
---

# dev-container

`dev-container` turns `dev-container.config.ts` into a Docker Compose stack:

- **Caged services** run on a network with no route out except the **broker**, a mitmproxy sidecar.
- **Brokered secrets** (`GH_TOKEN`, `NPM_TOKEN`, and the entries in `secrets`) appear inside the cage only as placeholders like `dc-GH_TOKEN-3f9c…`. The broker swaps in the real value on the way out, and only toward that secret's bound hosts.

## First: host or cage?

You are **inside the cage** if `HTTPS_PROXY` is `http://broker:8080`.

- **Inside the cage**, you cannot change the config and never see real tokens. Placeholders are expected; never try to obtain the real value.
- **On the host**, you own `dev-container.config.ts`, `.env` and `.env.secret`, and you run the CLI.

## On the host: the repair loop

1. If there is no config, run `npx dev-container setup`. It writes the config, `.env` and `.env.secret` (`GH_TOKEN` from `gh auth token`), and adds `.gitignore` entries. It never overwrites existing values.
2. Run `npx dev-container generate --json`. Diagnostics go to stderr as one JSON object per line: `{ level, name, why, fix, docs, sources?, data? }`. Agents get JSON automatically.
3. For each `level: "error"`, apply its `fix`. The `docs` link explains the code. `data.path` on `DEV_CONTAINER_C1002` names the config field. Config and secret errors are all listed in one run, so fix every one before re-running.
4. Re-run step 2 until there are no errors. Warnings such as `DEV_CONTAINER_S2002` (a builtin token is unset) are fine to leave.
5. Run `npx dev-container up`, then use `npx dev-container compose <args>` for `logs`, `exec`, `restart` and `down`.

Code prefixes:

| Prefix | Area |
| --- | --- |
| `C1` | config |
| `S2` | secrets and env files |
| `N3` | ports, volumes, persist |
| `D4` | docker and the control API |
| `B5` | broker blocks, seen from inside the cage |

Secret values belong in `.env.secret`, never in `dev-container.config.ts`. Do not print them.

## Inside the cage: a broker 403

The response body reads like a diagnostic, and the header `x-dev-container-diagnostic` carries the code.

| Code | Who fixes it | What to do |
| --- | --- | --- |
| `DEV_CONTAINER_B5002` | you | Move the token from the URL into a header (`Authorization`, `x-api-key`). |
| `DEV_CONTAINER_B5003` | you | Re-read the token from its environment variable. Stored copies go stale on every `up`, so reference `${NPM_TOKEN}` in `.npmrc` instead of pasting a value. |
| `DEV_CONTAINER_B5005` | you | Use `https://`. |
| `DEV_CONTAINER_B5001` | the host | Stop and ask the user to add the host to `egress.allow`. |
| `DEV_CONTAINER_B5004` | you or the host | Send the token only to its bound hosts. If another host truly needs it, ask the user to add it to that secret's `hosts`. |
| `DEV_CONTAINER_B5006` | the host | Ask the user to set the secret in `.env.secret` and run `dev-container up`. |
| `DEV_CONTAINER_B5007` | you or the host | The secret's `rules` deny this method and path. Do the task another way; do not retry with an encoded or reshaped path. If it must be allowed, ask the user to change that secret's `rules`. |

When the host has to act, quote the diagnostic's `fix` line to the user verbatim.

## Config at a glance

```ts
import type { UserConfig } from 'dev-container'

export default {
  envFile: ['.env', '.env.secret'], // later files win; the shell env wins over both
  builtins: { npm: false }, // github/npm are on whenever their token is set
  secrets: [{
    env: 'ACME_KEY',
    hosts: ['api.acme.dev'], // brokered, placeholder in the cage
    rules: [{ action: 'allow', method: 'GET' }, { action: 'deny' }], // first match wins; unmatched is allowed
  }],
  egress: { policy: 'allowlist', allow: ['registry.npmjs.org'] }, // default: { policy: 'open' }
  services: {
    agent: {
      image: 'node:24',
      command: ['sleep', 'infinity'],
      env: { ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY' } }, // real value, visible in the cage
      ports: [3000, '5170-5180', { port: 6767, tailnet: true }],
      volumes: ['./:/workspace'],
      persist: ['/root'],
    },
  },
} satisfies UserConfig
```

The full reference is in the package README.
