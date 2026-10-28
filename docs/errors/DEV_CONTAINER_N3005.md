# DEV_CONTAINER_N3005: Tailnet port without Tailscale

A port sets `tailnet: true`, but neither its service nor the top level has a `tailscale` section, so nothing serves it on the tailnet.

## Fix

Add the sidecar and an auth key:

```ts
export default defineConfig({
  tailscale: { hostname: 'agents' },
  // ...
})
```

```sh
# .env.secret
TS_AUTHKEY=tskey-auth-...
```

Alternatively, set `tailscale: { hostname: '...' }` on the service to give it its own node, or drop `tailnet: true`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
