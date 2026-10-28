# DEV_CONTAINER_B5003: Broker: unknown placeholder

Placeholders are regenerated on every `dev-container up`. This one is from an earlier run, typically a token copied into a file (`.npmrc`, a credentials file, a script) instead of read from the environment.

## Fix

Read the token from its environment variable at request time. For npm, reference it as `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` in `.npmrc`. If the variable itself is stale, the container predates the broker: run `dev-container up` on the host.

**Where:** Usually fixed inside the container; if the configuration is what's wrong, fix it on the host and run `dev-container up`.
