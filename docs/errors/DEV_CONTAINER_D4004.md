# DEV_CONTAINER_D4004: Dashboard API: invalid request

The request's path or query does not match the API, for example a service name starting with `-` or a non-numeric `tail`.

## Fix

Compare the request with `GET /openapi.json`.

**Where:** Fix inside the container, in the code or command that sent the request.
