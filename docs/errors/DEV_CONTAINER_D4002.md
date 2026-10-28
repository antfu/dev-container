# DEV_CONTAINER_D4002: docker failed

A docker command returned an error. The diagnostic carries docker's own output.

## Fix

Read docker's message. The most common causes are a stack that is not running (run `dev-container up`), an unknown service name, or a Docker daemon that is not running.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
