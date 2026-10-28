# DEV_CONTAINER_N3003: Port range too wide

The relay runs one forwarder per port, so ranges are capped at 100 ports.

## Fix

Publish only the ports the service actually listens on.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
