// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    vue: true,
    antislop: true,
    ignores: ['packages/monitor/monitor.html'],
  },
)
