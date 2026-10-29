# A Chromium desktop served over the web, which you sign in to by hand.
FROM lscr.io/linuxserver/chromium:latest
# certutil, to add the broker's CA to Chromium's NSS database.
RUN apt-get update && apt-get install -y --no-install-recommends libnss3-tools \
  && rm -rf /var/lib/apt/lists/*
# Init scripts the base image runs on every start: trust the broker CA, clear a stale Chromium lock.
COPY cont-init.d/ /custom-cont-init.d/
