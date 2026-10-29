# claude

Claude Code as a shell agent in a cage. Outbound traffic is limited to an allowlist: the Anthropic hosts and the npm registry.

```sh
npx @antfu/dev-container setup
dev-container up
dev-container compose exec claude claude
```

Sign in on first run. The login and history are kept in `.dev-container/state/claude/`, so they survive recreation. Your projects go in `./projects`.
