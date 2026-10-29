import { defineConfig } from '@antfu/dev-container'

/**
 * Commits signed with an SSH key. Create a dedicated one without a passphrase:
 *   ssh-keygen -t ed25519 -N '' -f ./signing/id_ed25519
 * Then add `signing/id_ed25519.pub` to GitHub as a *signing* key (github.com/settings/keys).
 * The private key lives in the container, so never reuse a key that can log in anywhere.
 */
export default defineConfig({
  services: {
    agent: {
      build: '.',
      command: ['sleep', 'infinity'],
      git: { name: 'Ada', email: 'ada@example.com' },
      env: {
        // git reads these as `-c` options, so no .gitconfig is needed in the image.
        GIT_CONFIG_COUNT: '4',
        GIT_CONFIG_KEY_0: 'gpg.format',
        GIT_CONFIG_VALUE_0: 'ssh',
        GIT_CONFIG_KEY_1: 'user.signingkey',
        GIT_CONFIG_VALUE_1: '/home/node/.signing/id_ed25519.pub',
        GIT_CONFIG_KEY_2: 'commit.gpgsign',
        GIT_CONFIG_VALUE_2: 'true',
        GIT_CONFIG_KEY_3: 'tag.gpgsign',
        GIT_CONFIG_VALUE_3: 'true',
      },
      // Read-only, and ssh-keygen needs the private key next to the public one.
      volumes: ['./signing:/home/node/.signing:ro', './projects:/home/node/projects'],
    },
  },
})
