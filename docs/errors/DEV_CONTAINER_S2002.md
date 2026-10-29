# DEV_CONTAINER_S2002: Builtin secret is off

This is a warning, not an error. The `github` or `npm` builtin is detected automatically from `GITHUB_TOKEN`/`GH_TOKEN` or `NPM_TOKEN`, and none of them is set, so the builtin is skipped and the container gets no placeholder for it.

## Fix

Set the token in `.env.secret` to enable it. If you don't need it, silence the warning:

```ts
export default defineConfig({
  builtins: { npm: false },
  // ...
})
```

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
