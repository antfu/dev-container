FROM ghcr.io/getpaseo/paseo:latest
# Stay root: the base entrypoint drops the daemon and its agents to the `paseo` user.
USER root
RUN npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai
