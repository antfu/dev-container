# DEV_CONTAINER_D4005: GPG signing setup failed

The `gpg` builtin imports the signing key into the running container after `up`. The import ran inside the container and failed, so commits there are not signed. The rest of the stack is up.

## Fix

Make sure the image has `gpg` and `git`, that `builtins.gpg.user` names a user that exists in it, and that the key is an armored private key or base64 of one without a passphrase:

```ts
export default defineConfig({
  builtins: {
    // 'auto' reads GPG_PRIVATE_KEY (and GPG_PUBLIC_KEY) from the env files; it is off when unset.
    gpg: { user: 'node', services: ['agent'] },
  },
  services: {
    agent: { build: '.', git: { name: 'Ada', email: 'ada@example.com' } },
  },
})
```

Then run `dev-container up` again.

**Where:** Fix on the host, in `dev-container.config.ts` or the image, then run `dev-container up`.
