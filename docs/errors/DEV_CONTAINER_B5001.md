# DEV_CONTAINER_B5001: Broker: host not on the allowlist

The stack uses `egress: { policy: 'allowlist' }` and the request (or CONNECT tunnel) targets a host that is neither in `egress.allow` nor bound to a secret. The broker answers `403` with the header `x-dev-container-diagnostic: DEV_CONTAINER_B5001`.

## Fix

If the host is needed, add it on the host:

```ts
export default defineConfig({
  egress: {
    policy: 'allowlist',
    allow: ['registry.npmjs.org', '*.example.com']
  },
  // ...
})
```

then `dev-container up`. An agent inside the container cannot change this; it should report the host it needs.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
