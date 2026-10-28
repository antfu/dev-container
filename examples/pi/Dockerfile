FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @mariozechner/pi-coding-agent
USER node
WORKDIR /home/node/projects
