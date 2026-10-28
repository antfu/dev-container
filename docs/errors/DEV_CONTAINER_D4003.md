# DEV_CONTAINER_D4003: Dashboard API: bad token

Every dashboard API request needs `Authorization: Bearer <token>`.

## Fix

On the host the token is `$DEV_CONTAINER_DASHBOARD_TOKEN` when set, else `dashboard.token` from the config, else the contents of `.dev-container/dashboard-token`. Inside a service with `dashboard: true` it is in `$DEV_CONTAINER_DASHBOARD_TOKEN`, and the URL is in `$DEV_CONTAINER_DASHBOARD_URL`.

**Where:** Usually fixed inside the container; if the configuration is what's wrong, fix it on the host and run `dev-container up`.
