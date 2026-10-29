# Slim Node image; `node` is its non-root user with uid 1000.
FROM node:24-slim
# `ssh-keygen` does the signing; git calls it when `gpg.format` is `ssh`.
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Run as the non-root user from here on.
USER node
# Start in the mounted projects directory.
WORKDIR /home/node/projects
