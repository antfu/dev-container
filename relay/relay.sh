#!/bin/sh
# Forwards published ports into the caged network: each argument is `service:port` or `service:start-end`.
set -eu

pids=""
for spec in "$@"; do
  service=${spec%%:*}
  range=${spec#*:}
  port=${range%-*}
  end=${range#*-}
  while [ "$port" -le "$end" ]; do
    socat "TCP-LISTEN:$port,fork,reuseaddr" "TCP:$service:$port" &
    pids="$pids $!"
    port=$((port + 1))
  done
done

# Exit once any forwarder dies so the restart policy brings the relay back whole.
# shellcheck disable=SC2086
while kill -0 $pids 2>/dev/null; do
  sleep 5
done
exit 1
