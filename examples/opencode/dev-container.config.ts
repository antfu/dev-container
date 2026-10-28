import { defineConfig, presets } from 'dev-container'

export default defineConfig({
  secrets: [presets.github(), presets.npm()],
  services: {
    opencode: {
      build: '.',
      command: ['opencode', 'serve', '--hostname', '0.0.0.0', '--port', '4096'],
      env: { ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY' } },
      ports: [4096],
      volumes: ['./projects:/home/node/projects'],
      persist: ['/home/node/.local/share/opencode', '/home/node/.config/opencode'],
    },
  },
})
