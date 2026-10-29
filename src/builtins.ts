import type { ResolvedSecret } from './config'

interface Builtin {
  secret: ResolvedSecret
  /** Host variables checked in order; the first one set enables the builtin. */
  detect: string[]
}

export const BUILTIN_NAMES = ['github', 'npm'] as const
export type BuiltinName = typeof BUILTIN_NAMES[number]

/** Brokered automatically whenever one of their `detect` variables is set on the host. */
export const BUILTINS: Record<BuiltinName, Builtin> = {
  github: {
    secret: {
      env: 'GITHUB_TOKEN',
      aliases: ['GH_TOKEN'],
      hosts: [
        'api.github.com',
        'uploads.github.com',
        'github.com',
        'codeload.github.com',
      ],
      git: { host: 'github.com', username: 'x-access-token' },
      rules: [],
    },
    detect: ['GITHUB_TOKEN', 'GH_TOKEN'],
  },
  // Reference it from `.npmrc` as `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`.
  npm: {
    secret: {
      env: 'NPM_TOKEN',
      aliases: [],
      hosts: ['registry.npmjs.org'],
      rules: [],
    },
    detect: ['NPM_TOKEN'],
  },
}
