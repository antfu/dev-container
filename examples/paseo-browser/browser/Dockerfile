FROM lscr.io/linuxserver/chromium:latest
# certutil, to add the broker's CA to Chromium's NSS database.
RUN apt-get update && apt-get install -y --no-install-recommends libnss3-tools \
  && rm -rf /var/lib/apt/lists/*
COPY cont-init.d/ /custom-cont-init.d/
