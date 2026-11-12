# DEV_CONTAINER_C1004: A service's secret source has no secret to replace

`services.<name>.secrets` gives a service its own source for a brokered secret, keyed by the variable of a builtin (`GITHUB_TOKEN`, `NPM_TOKEN`) or of a `secrets` entry. No active secret has the variable you named: it is misspelled, it names a `secrets` entry that is not configured, or its builtin is turned off with `false`.

## Fix

Name the variable of a builtin that is not turned off, or of a `secrets` entry:

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
