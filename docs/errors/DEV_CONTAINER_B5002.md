# DEV_CONTAINER_B5002: Broker: placeholder in the URL

The broker only swaps secrets in request headers. A placeholder in the URL or query string would reach the server as-is, so the request is refused.

## Fix

Send the credential in a header, e.g. `Authorization: Bearer $TOKEN` or `x-api-key: $TOKEN`. Most APIs accept one.

**Where:** Fix inside the container, in the code or command that sent the request.
