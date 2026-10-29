# paseo

The Paseo daemon with Claude Code, Codex and opencode, served on your tailnet. Every agent runs inside this one caged container.

```sh
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
```

Set these in your env files:

- `PASEO_PASSWORD`: the daemon checks it itself, so it lives in the cage.
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`: for the agents.
- `PASEO_CORS_ORIGINS` (optional): your tailnet origin, such as `https://paseo.<tailnet>.ts.net`. Set it if the web UI's websocket is rejected.

Tailscale also needs `TS_AUTHKEY`. Agents work in `./workspace`, and the daemon's home is kept in `.dev-container/state/paseo/`.
