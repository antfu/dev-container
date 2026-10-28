import { defineConfig } from '@antfu/dev-container'

/** A plain shell agent: `dev-container up`, then `dev-container compose exec claude claude`. */
export default defineConfig({
  egress: {
    policy: 'allowlist',
    allow: [
      'api.anthropic.com',
      'platform.claude.com',
      'claude.ai',
      'statsig.anthropic.com',
      'registry.npmjs.org',
    ],
  },
  services: {
    claude: {
      build: '.',
      command: ['sleep', 'infinity'],
      volumes: ['./projects:/home/node/projects'],
      // Keeps the `claude` login and history across recreation.
      persist: ['/home/node/.claude'],
    },
  },
})
