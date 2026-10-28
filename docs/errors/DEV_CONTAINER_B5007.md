# DEV_CONTAINER_B5007: Broker: request not permitted for this secret

The request carries a secret's placeholder to one of its bound hosts, but the secret's `rules` deny that method and path. Rules are checked in order and the first match wins, so the message names the rule that matched. Paths are compared after decoding, with `//`, `.` and `..` resolved, and without regard to case.

## Fix

Inside the container: do the task another way, without that secret. On the host, if the request should be allowed, put an `allow` rule before the one that matched:

```ts
export default defineConfig({
  builtins: {
    github: {
      rules: [
        { action: 'allow', path: '/repos/antfu/dev-container/**' },
        {
          action: 'deny',
          method: ['POST', 'PUT', 'PATCH', 'DELETE']
        },
      ],
    },
  },
  // ...
})
```

**Where:** Usually fixed inside the container; if the configuration is what's wrong, fix it on the host and run `dev-container up`.
