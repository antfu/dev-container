# vercel-ai-gateway

Claude Code, Codex, opencode and pi in one cage, all sent through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). One gateway key pays for every model, and the cage never holds it.

```sh
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
dev-container compose exec agents claude
```

Replace `claude` with `codex`, `opencode` or `pi` to use the others.

Create a key in your Vercel dashboard under **AI Gateway** and put it in `.env.secret` as `AI_GATEWAY_API_KEY`. The cage gets a placeholder under that name and under `ANTHROPIC_AUTH_TOKEN` and `OPENAI_API_KEY`. The broker swaps in the real key only on requests to `ai-gateway.vercel.sh`, and egress is limited to that host and the npm registry.

How each agent finds the gateway:

| Agent | Setting |
| --- | --- |
| Claude Code | `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`; `ANTHROPIC_API_KEY` is set empty |
| Codex | [`codex.toml`](./codex.toml), copied to `~/.codex/config.toml` in the image |
| opencode | Its `vercel` provider reads `AI_GATEWAY_API_KEY`; pick it with `/connect` or `/models` |
| pi | Its `vercel-ai-gateway` provider reads `AI_GATEWAY_API_KEY`; pick it with `/model` |

Amp is not here: it talks to its own service. See [`amp`](../amp).

Model names are gateway names such as `anthropic/claude-sonnet-4.5`. Change the `model` in `codex.toml` to one your key can use.
