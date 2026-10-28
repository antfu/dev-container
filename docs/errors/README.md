# Diagnostics

Every error `dev-container` reports carries one of these codes, a fix, and a link here.

| Code | | Fixed |
| --- | --- | --- |
| [DEV_CONTAINER_C1001](./DEV_CONTAINER_C1001.md) | No config file | host |
| [DEV_CONTAINER_C1002](./DEV_CONTAINER_C1002.md) | Invalid config | host |
| [DEV_CONTAINER_C1003](./DEV_CONTAINER_C1003.md) | Two secrets claim the same variable | host |
| [DEV_CONTAINER_S2001](./DEV_CONTAINER_S2001.md) | Secret variable not set | host |
| [DEV_CONTAINER_S2002](./DEV_CONTAINER_S2002.md) | Builtin secret is off | host |
| [DEV_CONTAINER_S2003](./DEV_CONTAINER_S2003.md) | Secret command failed | host |
| [DEV_CONTAINER_S2004](./DEV_CONTAINER_S2004.md) | Secret value cannot be stored | host |
| [DEV_CONTAINER_S2005](./DEV_CONTAINER_S2005.md) | envFile missing | host |
| [DEV_CONTAINER_S2006](./DEV_CONTAINER_S2006.md) | GH_TOKEN not prefilled | host |
| [DEV_CONTAINER_N3001](./DEV_CONTAINER_N3001.md) | Port published twice | host |
| [DEV_CONTAINER_N3002](./DEV_CONTAINER_N3002.md) | Invalid port | host |
| [DEV_CONTAINER_N3003](./DEV_CONTAINER_N3003.md) | Port range too wide | host |
| [DEV_CONTAINER_N3004](./DEV_CONTAINER_N3004.md) | Range on the tailnet | host |
| [DEV_CONTAINER_N3005](./DEV_CONTAINER_N3005.md) | Tailnet port without Tailscale | host |
| [DEV_CONTAINER_N3006](./DEV_CONTAINER_N3006.md) | Persist paths collide | host |
| [DEV_CONTAINER_D4001](./DEV_CONTAINER_D4001.md) | docker not found | host |
| [DEV_CONTAINER_D4002](./DEV_CONTAINER_D4002.md) | docker failed | host |
| [DEV_CONTAINER_D4003](./DEV_CONTAINER_D4003.md) | Control API: bad token | either |
| [DEV_CONTAINER_D4004](./DEV_CONTAINER_D4004.md) | Control API: invalid request | container |
| [DEV_CONTAINER_B5001](./DEV_CONTAINER_B5001.md) | Broker: host not on the allowlist | host |
| [DEV_CONTAINER_B5002](./DEV_CONTAINER_B5002.md) | Broker: placeholder in the URL | container |
| [DEV_CONTAINER_B5003](./DEV_CONTAINER_B5003.md) | Broker: unknown placeholder | either |
| [DEV_CONTAINER_B5004](./DEV_CONTAINER_B5004.md) | Broker: secret not bound to this host | either |
| [DEV_CONTAINER_B5005](./DEV_CONTAINER_B5005.md) | Broker: secret over plain HTTP | container |
| [DEV_CONTAINER_B5006](./DEV_CONTAINER_B5006.md) | Broker: secret has no value | host |
| [DEV_CONTAINER_B5007](./DEV_CONTAINER_B5007.md) | Broker: request not permitted for this secret | either |
