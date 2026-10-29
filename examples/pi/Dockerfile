# Slim Node image; `node` is its non-root user with uid 1000.
FROM node:24-slim
# git for the agent's work, ca-certificates for HTTPS through the broker, then pi itself.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @mariozechner/pi-coding-agent
# Run as the non-root user from here on.
USER node
# Start in the mounted projects directory.
WORKDIR /home/node/projects
