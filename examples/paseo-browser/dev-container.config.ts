import { defineConfig } from '@antfu/dev-container'

/**
 * Paseo next to a Chromium desktop you sign in to by hand. Agents drive that
 * browser over CDP, which Chromium serves on its own localhost only, so Paseo
 * joins the browser's network namespace.
 */
export default defineConfig({
  tailscale: { hostname: 'paseo' },
  // GH_TOKEN is brokered as usual; agents can still use it for anything but deleting a repo.
  builtins: { github: { rules: [{ action: 'deny', method: 'DELETE', path: '/repos/*/*' }] } },
  services: {
    browser: {
      build: './browser',
      env: {
        PUID: '1000',
        PGID: '1000',
        CUSTOM_USER: 'paseo',
        PASSWORD: { env: 'BROWSER_PASSWORD' },
        // Keep the desktop off 3000/3001 so agents' dev servers can use them. Only the
        // HTTP port is published: loopback on the host, HTTPS on the tailnet.
        CUSTOM_PORT: '6900',
        CUSTOM_HTTPS_PORT: '6901',
        CHROME_CLI: '--remote-debugging-port=9222 --user-data-dir=/config/chromium-cdp --proxy-server=http://broker:8080',
        // Relaunch Chromium when its window is closed, or agents lose CDP until the next restart.
        RESTART_APP: 'true',
      },
      ports: [{ port: 6900, tailnet: 6900 }],
      persist: ['/config'],
      compose: { shm_size: '1gb' },
    },
    paseo: {
      build: './paseo',
      network: 'service:browser',
      env: {
        PASEO_PASSWORD: { env: 'PASEO_PASSWORD' },
        PASEO_HOSTNAMES: '.ts.net',
        ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY' },
        OPENAI_API_KEY: { env: 'OPENAI_API_KEY' },
        AGENT_BROWSER_CDP: '9222',
      },
      ports: [{ port: 6767, tailnet: true }],
      volumes: ['./workspace:/workspace'],
      persist: ['/home/paseo'],
    },
  },
})
