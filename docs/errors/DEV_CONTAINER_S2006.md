# DEV_CONTAINER_S2006: GH_TOKEN not prefilled

This is a warning. `dev-container setup` tries `gh auth token` to fill `GH_TOKEN` in `.env.secret`, and the gh CLI is not installed, not logged in, or printed nothing. `GH_TOKEN` is left empty, so the `github` builtin stays off until it is set.

## Fix

Log in and run setup again; it only fills missing values:

```sh
gh auth login
npx @antfu/dev-container setup
```

Or paste a token (fine-grained or classic with `repo` scope) into `GH_TOKEN=` in `.env.secret`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
