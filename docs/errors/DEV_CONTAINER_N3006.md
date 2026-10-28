# DEV_CONTAINER_N3006: Persist paths collide

Each `persist` path is stored under `.dev-container/state/<service>/` with `/` replaced by `-`, and two of a service's paths end up with the same directory name.

## Fix

Persist their common parent instead, or rename one of the paths.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
