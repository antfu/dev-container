import { defineConfig } from 'dev-container'

/** Interactive: `dev-container up`, then `dev-container compose exec pi pi`. */
export default defineConfig({
  services: {
    pi: {
      build: '.',
      command: ['sleep', 'infinity'],
      // A `claude setup-token` token; pi reads it for Anthropic subscriptions.
      env: { ANTHROPIC_OAUTH_TOKEN: { command: 'cat ~/.config/anthropic-setup-token' } },
      volumes: ['./projects:/home/node/projects'],
      persist: ['/home/node/.pi'],
    },
  },
})
