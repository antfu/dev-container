#!/usr/bin/env bash
# Smoke test against real Docker: needs `pnpm build` first and ACME_KEY set to any value.
set -euo pipefail
cd "$(dirname "$0")"

cli() { node ../dist/cli.mjs "$@"; }
agent() { cli compose exec -T agent sh -c "$1"; }
cleanup() {
  cli compose logs --no-color broker || true
  cli compose down --volumes --remove-orphans || true
}
trap cleanup EXIT

cli up --wait

echo '> the cage only sees a placeholder'
agent 'case "$ACME_KEY" in dc-ACME_KEY-*) ;; *) exit 1 ;; esac'

echo '> the broker swaps it for the bound host'
agent 'curl -sf -H "x-api-key: $ACME_KEY" https://postman-echo.com/headers' | grep -qF "$ACME_KEY"

echo '> the placeholder is refused for any other host'
test "$(agent 'curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: $ACME_KEY" https://example.com/')" = 403

echo '> there is no route out that skips the broker'
if agent 'curl -s -m 5 --noproxy "*" https://example.com/ >/dev/null'; then exit 1; fi

echo '> published ports reach the caged service through the relay'
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)" != 000

echo 'e2e passed'
