# DEV_CONTAINER_B5004: Broker: secret not bound to this host

The request sends a secret's placeholder to a host outside that secret's `hosts`. The broker matches the real upstream target, not the `Host` header, and refuses rather than leak the real value.

## Fix

Inside the container: send the credential only to the hosts it belongs to. On the host, if the host really needs it, add it to the secret:

```ts
export default defineConfig({
  secrets: [{ env: 'ACME_KEY', hosts: ['api.acme.dev', 'uploads.acme.dev'] }],
  // ...
})
```

**Where:** Usually fixed inside the container; if the configuration is what's wrong, fix it on the host and run `dev-container up`.
