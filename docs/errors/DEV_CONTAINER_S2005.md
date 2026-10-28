# DEV_CONTAINER_S2005: envFile missing

A file listed in `envFile` does not exist.

## Fix

Create it (`npx @antfu/dev-container setup` writes `.env` and `.env.secret`) or remove it from `envFile`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
