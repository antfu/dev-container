# DEV_CONTAINER_D4003: Control API: bad token

Every control API request needs `Authorization: Bearer <token>`.

## Fix

On the host the token is in `.dev-container/control-token`. Inside a service with `control: true` it is in `$DEV_CONTAINER_CONTROL_TOKEN`, and the URL is in `$DEV_CONTAINER_CONTROL_URL`.

**Where:** Usually fixed inside the container; if the configuration is what's wrong, fix it on the host and run `dev-container up`.
