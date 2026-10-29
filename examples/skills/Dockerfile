# Slim Node image; `node` is its non-root user with uid 1000.
FROM node:24-slim
# git, because `skills add` clones GitHub repos; ca-certificates for HTTPS through the broker. Then the skills CLI and two agents to use the skills.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g skills @anthropic-ai/claude-code @openai/codex
# Reads skills.txt and installs what it lists, then hands over to the container's command.
COPY install-skills /usr/local/bin/install-skills
# Run as the non-root user from here on.
USER node
# Start in the mounted projects directory.
WORKDIR /home/node/projects
# Runs on every start, so a skill added to skills.txt appears after a restart.
ENTRYPOINT ["/usr/local/bin/install-skills"]
