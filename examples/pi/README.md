# pi

pi as an interactive shell agent, using an Anthropic subscription token.

```sh
claude setup-token > ~/.config/anthropic-setup-token
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
dev-container compose exec pi pi
```

The token is read from `~/.config/anthropic-setup-token` on the host. Pi's data is kept in `.dev-container/state/pi/`. Your projects go in `./projects`.
