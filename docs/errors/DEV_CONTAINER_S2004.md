# DEV_CONTAINER_S2004: Secret value cannot be stored

Resolved values are written to compose env files in single quotes, which keeps `$` literal. A value that contains a single quote or a newline cannot be written that way.

## Fix

Store a single-line value without `'`. For multi-line material such as keys, base64-encode it on the host and decode it inside the container.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
