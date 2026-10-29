import { defineConfig } from '@antfu/dev-container'

/**
 * Claude Code, Codex, opencode and pi, all billed through one Vercel AI Gateway key.
 * Interactive: `dev-container up`, then `dev-container compose exec agents claude` (or `codex`, `opencode`, `pi`).
 */
export default defineConfig({
  egress: {
    policy: 'allowlist',
    allow: [
      'ai-gateway.vercel.sh',
      'registry.npmjs.org',
    ],
  },
  // The cage holds a placeholder. The broker swaps in the real key, and only towards the gateway.
  secrets: [
    {
      env: 'AI_GATEWAY_API_KEY',
      // The same placeholder under the names the other agents read.
      aliases: ['ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'],
      hosts: ['ai-gateway.vercel.sh'],
    },
  ],
  services: {
    agents: {
      build: '.',
      command: ['sleep', 'infinity'],
      env: {
        // Claude Code: the gateway speaks the Anthropic API at its root, and takes the key as a bearer token.
        ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh',
        // Must be empty, or Claude Code sends this instead of the auth token.
        ANTHROPIC_API_KEY: '',
        // Anything that reads the OpenAI variables gets the gateway's OpenAI-compatible endpoint.
        OPENAI_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
        // opencode and pi have a Vercel provider that reads AI_GATEWAY_API_KEY, so they need no URL.
        // Codex is pointed at the gateway by codex.toml.
      },
      volumes: ['./projects:/home/node/projects'],
      // Keeps each agent's login-free settings and history across recreation.
      persist: [
        '/home/node/.claude',
        '/home/node/.local/share/opencode',
        '/home/node/.config/opencode',
        '/home/node/.pi',
      ],
    },
  },
})
