import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { mockApi } from './mock'

/** The entry is `dashboard.html`, so the dev server needs `/` pointed at it. */
function rootPage(): Plugin {
  return {
    name: 'dashboard-root-page',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?'))
          req.url = `/dashboard.html${req.url.slice(1)}`
        next()
      })
    },
  }
}

/** The dashboard server serves one self-contained HTML file, so the page needs no asset routes. */
export default defineConfig(({ command, mode }) => {
  const mock = command === 'serve' && mode !== 'live'
  return {
    plugins: [
      rootPage(),
      vue(),
      // `vite --mode live` talks to a real server instead.
      mock && mockApi(),
      UnoCSS(),
      viteSingleFile(),
    ],
    // The mock server asks for basic auth, so the page skips its token form.
    define: { __MOCK__: mock },
    build: {
      outDir: '../../dist',
      emptyOutDir: false,
      rollupOptions: { input: 'dashboard.html' },
    },
    server: {
    // In live mode, `dev-container serve` in another terminal provides the API.
      proxy: mock
        ? undefined
        : {
            '/info': 'http://127.0.0.1:7357',
            '/services': 'http://127.0.0.1:7357',
            '/stats': 'http://127.0.0.1:7357',
            '/requests': 'http://127.0.0.1:7357',
            '/links': 'http://127.0.0.1:7357',
            '/restart': 'http://127.0.0.1:7357',
            '/update': 'http://127.0.0.1:7357',
            '/upgrade': 'http://127.0.0.1:7357',
          },
    },
  }
})
