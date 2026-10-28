import type { SecretConfig } from './config'

type PresetOptions = Pick<SecretConfig, 'from'>

/** `gh`, the GitHub API and git over HTTPS. The real token never enters the cage. */
export function github(options: PresetOptions = {}): SecretConfig {
  return {
    env: 'GH_TOKEN',
    aliases: ['GITHUB_TOKEN'],
    hosts: ['api.github.com', 'uploads.github.com', 'github.com', 'codeload.github.com'],
    git: { host: 'github.com', username: 'x-access-token' },
    ...options,
  }
}

/**
 * The npm registry. Reference it from `.npmrc` as
 * `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`.
 */
export function npm(options: PresetOptions = {}): SecretConfig {
  return {
    env: 'NPM_TOKEN',
    hosts: ['registry.npmjs.org'],
    ...options,
  }
}
