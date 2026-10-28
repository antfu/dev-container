# DEV_CONTAINER_D4001: docker not found

The docker CLI could not be started.

## Fix

Install Docker with the compose plugin (Docker Desktop, OrbStack, colima or Docker Engine) and make sure `docker compose version` works in the same shell.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
