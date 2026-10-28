# DEV_CONTAINER_N3001: Port published twice

Every published port is forwarded by the relay to exactly one service. Two services list the same port, or overlapping ranges.

## Fix

Change one of the `ports` entries, and make the service listen on the new port.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
