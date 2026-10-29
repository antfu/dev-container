# The Paseo daemon image; it already runs the daemon and has Node.
FROM ghcr.io/getpaseo/paseo:latest
# Stay root: the base entrypoint drops the daemon and its agents to the `paseo` user.
USER root
# jq merges the managed MCP config into Claude's state on start; then the agents, plus agent-browser and Playwright MCP to drive the browser over CDP.
RUN apt-get update && apt-get install -y --no-install-recommends jq \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code @openai/codex agent-browser @playwright/mcp
# Managed config that `seed-home` copies into the persisted home.
COPY config/ /etc/paseo-browser/
# The entrypoint wrapper that syncs that config, then hands over to the base image.
COPY seed-home /usr/local/bin/seed-home
# tini stays PID 1 as in the base image; `seed-home` runs before the daemon starts.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/seed-home"]
