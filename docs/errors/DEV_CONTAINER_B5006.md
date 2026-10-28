# DEV_CONTAINER_B5006: Broker: secret has no value

The broker was started without a value for this secret, so it cannot swap the placeholder.

## Fix

Set the secret on the host (for example in `.env.secret`) and run `dev-container up`. `dev-container generate` reports a missing value as `DEV_CONTAINER_S2001` before this can happen, so this usually means the broker was started some other way.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
