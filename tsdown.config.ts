import { defineConfig } from 'tsdown'
import { StaleGuardRecorder } from 'tsdown-stale-guard'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
  ],
  dts: true,
  exports: { exclude: ['cli'] },
  publint: true,
  plugins: [
    StaleGuardRecorder(),
  ],
})
