# DEV_CONTAINER_C1004: A service's secret source has no secret to replace

`services.<name>.secrets` gives a service its own source for a brokered secret, keyed by the variable of a builtin (`GITHUB_TOKEN`, `NPM_TOKEN`) or of a `secrets` entry. No active secret has the variable you named: it is misspelled, or its builtin is off because its token is not set.

## Fix

Name the variable of a secret that is on, and keep that secret's own token set too, since other services still use it:

```ts
export default defineConfig({
  services: {
    main: {
      image: 'alpine',
      secrets: {
        GITHUB_TOKEN: { env: 'GITHUB_TOKEN_MAIN' }
      }
    }
  },
  // ...
})
```

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
