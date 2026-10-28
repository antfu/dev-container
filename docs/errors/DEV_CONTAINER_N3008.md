# DEV_CONTAINER_N3008: Tailnet port used twice

`tailnet: true` serves a port on tailnet port 443. A tailscale node can serve each tailnet port once, so two services on the same node cannot both use `tailnet: true`.

## Fix

Give all but one of them a tailnet port of their own, or give a service its own `tailscale` node:

```ts
export default defineConfig({
  tailscale: { hostname: 'agents' },
  services: {
    paseo: {
      image: 'ghcr.io/getpaseo/paseo:latest',
      ports: [
        { port: 6767, tailnet: true }
      ]
    },
    browser: {
      build: './browser',
      ports: [
        { port: 6900, tailnet: 6900 }
      ]
    },
  },
})
```

**Where:** Fix on the host, in `dev-container.config.ts`, then run `dev-container up`.
