# skills

Claude Code and Codex with global skills installed from a list. The [`skills`](https://www.npmjs.com/package/skills) CLI installs them, and the skills and their lock file are kept across recreation.

```sh
cp .env.example .env
cp .env.secret.example .env.secret # then fill it in
dev-container up
dev-container compose exec skills claude
```

## skills.txt

Each line is `<source> [skill ...]`: a GitHub repo, a URL or a local path, then the names of the skills to take from it. With no names, every skill in the source is installed. Blank lines and `#` comments are skipped.

```
antfu/skills antfu
vuejs-ai/skills vue-best-practices vue-testing-best-practices
```

`skills.txt` is mounted read-only. After editing it, restart the service; the entrypoint, [`install-skills`](./install-skills), runs `skills add --global` for each line on every start:

```sh
dev-container compose restart skills
```

A source that fails to install is reported in the logs and does not stop the container.

## Where things live

| What | Where in the container |
| --- | --- |
| Skills shared by agents | `~/.agents/skills` |
| The lock file | `~/.agents/.skill-lock.json` |
| Claude Code's links to the skills | `~/.claude/skills` |
| Codex's login and settings | `~/.codex` |

The config persists `~/.agents`, `~/.claude` and `~/.codex`, so each is kept in `.dev-container/state/skills/`. Set `SKILLS_AGENTS` in the config to install for other agents.

`skills add` clones from GitHub through the broker. A `GITHUB_TOKEN` in `.env.secret` is brokered like any other, so it never enters the cage.
