# DEV_CONTAINER_N3007: Network is not a caged service

A service sets `network: 'service:<name>'`, but `<name>` is the service itself, is not defined in `services`, or sets `network` itself. A service can only join the network of another caged service, never the broker, relay or tailscale sidecars, which have a route out.

## Fix

Point `network` at a caged service that owns its network:

```ts
export default defineConfig({
  services: {
    browser: { image: 'lscr.io/linuxserver/chromium' },
    agent: { image: 'ghcr.io/getpaseo/paseo', network: 'service:browser' },
  },
})
```

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
