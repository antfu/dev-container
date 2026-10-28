import { defineConfig } from '@antfu/dev-container'

/** Paseo's daemon runs every agent inside this one caged container. */
export default defineConfig({
  tailscale: { hostname: 'paseo' },
  services: {
    paseo: {
      build: '.',
      env: {
        // Checked by the daemon itself, so it has to live in the cage.
        PASEO_PASSWORD: { env: 'PASEO_PASSWORD' },
        ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY' },
        OPENAI_API_KEY: { env: 'OPENAI_API_KEY' },
        // Lets the daemon accept the tailnet hostname served by the Tailscale sidecar.
        PASEO_HOSTNAMES: '.ts.net',
        // The sidecar terminates TLS and sends X-Forwarded-Proto. Without trusting it, the web UI
        // takes its daemon connection as ws://<host>:80 instead of wss://<host>:443.
        PASEO_TRUSTED_PROXIES: 'loopback,uniquelocal',
        // The web UI's websocket comes from the tailnet origin, which the daemon rejects unless listed,
        // e.g. https://paseo.<tailnet>.ts.net. Leave it unset to skip it.
        PASEO_CORS_ORIGINS: { env: 'PASEO_CORS_ORIGINS', optional: true },
      },
      ports: [{ port: 6767, tailnet: true }],
      volumes: ['./workspace:/workspace'],
      persist: ['/home/paseo'],
    },
  },
})
