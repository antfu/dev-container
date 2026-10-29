# opencode

`opencode serve` in a cage, published on `127.0.0.1:4096`.

```sh
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
```

It reads `ANTHROPIC_API_KEY` from your env files. Its login and config are kept in `.dev-container/state/opencode/`. Your projects go in `./projects`.
