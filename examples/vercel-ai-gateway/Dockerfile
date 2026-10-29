# Slim Node image; `node` is its non-root user with uid 1000.
FROM node:24-slim
# git for the agents' work, ca-certificates for HTTPS through the broker, then the agents.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai @mariozechner/pi-coding-agent
# Codex has no base URL variable for a custom provider, so it gets one in its config file.
COPY --chown=node:node codex.toml /home/node/.codex/config.toml
# Run as the non-root user from here on.
USER node
# Start in the mounted projects directory.
WORKDIR /home/node/projects
