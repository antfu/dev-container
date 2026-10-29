# amp

[Amp](https://ampcode.com) as an interactive shell agent in a cage. Outbound traffic is limited to an allowlist: `ampcode.com` and the npm registry.

```sh
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
dev-container compose exec amp amp
```

Put `AMP_API_KEY` in your env files; create the key at [ampcode.com/settings](https://ampcode.com/settings). Amp's settings and threads are kept in `.dev-container/state/amp/`. Your projects go in `./projects`.

If Amp reaches a host that is not on the allowlist, the broker blocks it. Add the host under `egress.allow`.
