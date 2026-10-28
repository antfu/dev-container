# DEV_CONTAINER_C1001: No config file

`dev-container` looks for `dev-container.config.{ts,mts,js,mjs,json}` in the current directory and every parent directory, and found none.

## Fix

Create one. `setup` also writes `.env`, `.env.secret` and the `.gitignore` entries:

```sh
npx dev-container setup
```

If a config already exists, run the command from its directory or a subdirectory.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
