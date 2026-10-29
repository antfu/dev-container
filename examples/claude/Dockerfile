# Slim Node image; `node` is its non-root user with uid 1000.
FROM node:24-slim
# git for the agent's work, ca-certificates for HTTPS through the broker, then Claude Code itself.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code
# Run as the non-root user from here on.
USER node
# Where the config mounts `claude`'s settings and login; this must match the `persist` path.
ENV CLAUDE_CONFIG_DIR=/home/node/.claude
# Start in the mounted projects directory.
WORKDIR /home/node/projects
