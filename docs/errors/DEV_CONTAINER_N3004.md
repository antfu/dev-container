# DEV_CONTAINER_N3004: Range on the tailnet

`tailnet: true` serves each port through `tailscale serve`, one entry per port, so it cannot take a range.

## Fix

List the tailnet ports one by one:

```ts
export default defineConfig({
  services: {
    agent: {
      image: 'node:24',
      ports: [{ port: 3000, tailnet: true }, { port: 3001, tailnet: true }],
    },
  },
})
```

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
