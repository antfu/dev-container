# DEV_CONTAINER_B5005: Broker: secret over plain HTTP

The broker only sends real secrets over HTTPS.

## Fix

Use the `https://` URL.

**Where:** Fix inside the container, in the code or command that sent the request.
