#!/bin/sh
# Runs as root only long enough to prepare volumes, then drops to the mitmproxy user.
set -eu

CONFDIR=/home/mitmproxy/.mitmproxy
PUBLIC_CA=/etc/dev-container/ca

chown -R mitmproxy:mitmproxy "$CONFDIR"
# Create the CA up front so only its public certificate is shared with the cage;
# the private key stays in the broker-only volume.
gosu mitmproxy python3 -c "from mitmproxy.certs import CertStore; CertStore.from_store('$CONFDIR', 'mitmproxy', 2048)"
install -m 0644 "$CONFDIR/mitmproxy-ca-cert.pem" "$PUBLIC_CA/mitmproxy-ca-cert.pem"

exec gosu mitmproxy mitmdump \
  --listen-host 0.0.0.0 \
  --listen-port 8080 \
  --quiet \
  --set "confdir=$CONFDIR" \
  -s /broker/addon.py
