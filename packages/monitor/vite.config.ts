import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** The control server serves one self-contained HTML file, so the page needs no asset routes. */
export default defineConfig({
  plugins: [vue(), UnoCSS(), viteSingleFile()],
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: { input: 'monitor.html' },
  },
  server: {
    // `dev-container serve` in another terminal provides the API.
    proxy: { '/services': 'http://127.0.0.1:7357', '/stats': 'http://127.0.0.1:7357', '/restart': 'http://127.0.0.1:7357', '/update': 'http://127.0.0.1:7357' },
  },
})
