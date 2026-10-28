# DEV_CONTAINER_S2001: Secret variable not set

A secret source `{ env: 'NAME' }` found no value. Sources are looked up in the shell environment first, then in each `envFile` in order.

## Fix

Set the variable in `.env.secret`:

```sh
NAME=value
```

or export it before running the command, or switch the source to a command, e.g. `{ command: 'op read op://vault/item/token' }`.

**Where:** Fix on the host, in `dev-container.config.ts` or the env files, then run `dev-container up`.
