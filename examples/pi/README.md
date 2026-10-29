# pi

pi as an interactive shell agent, using an Anthropic subscription token.

```sh
claude setup-token > ~/.config/anthropic-setup-token
npx @antfu/dev-container setup
dev-container up
dev-container compose exec pi pi
```

The token is read from `~/.config/anthropic-setup-token` on the host. Pi's data is kept in `.dev-container/state/pi/`. Your projects go in `./projects`.
