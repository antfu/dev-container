FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code
USER node
ENV CLAUDE_CONFIG_DIR=/home/node/.claude
WORKDIR /home/node/projects
