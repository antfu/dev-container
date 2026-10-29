# git-signing

A shell agent whose commits and tags are signed with an SSH key. Git is configured through its own `GIT_CONFIG_*` environment variables, so the image needs no `.gitconfig`.

1. Create a dedicated key without a passphrase:

   ```sh
   ssh-keygen -t ed25519 -N '' -f ./signing/id_ed25519
   ```

2. Add `signing/id_ed25519.pub` to GitHub as a **signing** key at [github.com/settings/keys](https://github.com/settings/keys).
3. Set your name and email under `git` in the config, then start it:

   ```sh
   dev-container up
   dev-container compose exec agent bash
   ```

The private key sits in the container, mounted read-only from `./signing` (git-ignored). Never reuse a key that can log in anywhere.
