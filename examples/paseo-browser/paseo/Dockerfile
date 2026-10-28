FROM ghcr.io/getpaseo/paseo:latest
# Stay root: the base entrypoint drops the daemon and its agents to the `paseo` user.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends jq \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code @openai/codex agent-browser @playwright/mcp
COPY config/ /etc/paseo-browser/
COPY seed-home /usr/local/bin/seed-home
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/seed-home"]
