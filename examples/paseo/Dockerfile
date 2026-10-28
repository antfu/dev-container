FROM ghcr.io/getpaseo/paseo:latest
# Stay root: the base entrypoint drops the daemon and its agents to the `paseo` user.
USER root
# gh comes from GitHub's apt repo, since Debian's copy is old. It reads the placeholder GH_TOKEN that the
# github builtin sets, and the broker swaps in the real token on api.github.com.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai
