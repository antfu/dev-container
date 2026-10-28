# DEV_CONTAINER_S2003: Secret command failed

A `{ command }` source exited with an error or printed nothing.

## Fix

Run the command in a shell on the host from the project directory until it prints the value, e.g. log in to the password manager first. Leading and trailing whitespace is trimmed.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
