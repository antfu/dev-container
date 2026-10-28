import { defineConfig } from 'dev-container'

/** Paseo's daemon runs every agent inside this one caged container. */
export default defineConfig({
  envFile: ['.env', '.env.secret'],
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
      },
      ports: [{ port: 6767, tailnet: true }],
      volumes: ['./workspace:/workspace'],
      persist: ['/home/paseo'],
    },
  },
})
