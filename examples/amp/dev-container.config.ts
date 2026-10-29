import { defineConfig } from '@antfu/dev-container'

/** Interactive: `dev-container up`, then `dev-container compose exec amp amp`. */
export default defineConfig({
  egress: {
    policy: 'allowlist',
    allow: [
      'ampcode.com',
      'registry.npmjs.org',
    ],
  },
  services: {
    amp: {
      build: '.',
      command: ['sleep', 'infinity'],
      env: {
        // From ampcode.com/settings. Amp reads it instead of asking you to log in.
        AMP_API_KEY: { env: 'AMP_API_KEY' },
      },
      volumes: ['./projects:/home/node/projects'],
      // Keeps Amp's settings and thread history across recreation.
      persist: ['/home/node/.config/amp', '/home/node/.local/share/amp'],
    },
  },
})
