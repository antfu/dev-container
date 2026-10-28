# DEV_CONTAINER_N3002: Invalid port

A port is outside 1-65535, or a range has start > end.

## Fix

Use `3000`, `'3000'` or `'3000-3005'`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
