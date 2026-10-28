# DEV_CONTAINER_C1002: Invalid config

A field in the config does not match the schema. The diagnostic names the path (for example `services.agent.ports.0`) and what was expected. Every invalid field is reported at once.

## Fix

Edit the named field. The most common causes:

- a service without `image` or `build`
- a host pattern with a scheme (`https://api.acme.dev`): use the bare host, `api.acme.dev`, or `*.acme.dev`
- a relative `persist` path: persist paths are container paths and start with `/`
- the reserved service names `broker`, `relay`, `tailscale` and `tailscale-*`, or the reserved volume names `ca` and `broker-ca`
- a misspelled key: the schema is strict, so unknown keys are rejected

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
