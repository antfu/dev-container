# DEV_CONTAINER_C1003: Two secrets claim the same variable

Two brokered secrets, or a secret and a builtin (`github` claims `GITHUB_TOKEN` and `GH_TOKEN`, `npm` claims `NPM_TOKEN`), would put different placeholders into the same environment variable.

## Fix

Keep one. To replace a builtin with your own definition, turn the builtin off:

```ts
export default defineConfig({
  builtins: { github: false },
  secrets: [
    {
      env: 'GITHUB_TOKEN',
      hosts: ['github.example.com']
    }
  ],
  // ...
})
```

To change only where a builtin's value comes from, override its source instead: `builtins: { github: { from: { command: 'gh auth token' } } }`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
