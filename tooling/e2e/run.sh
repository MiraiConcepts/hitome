#!/usr/bin/env bash
# One-command e2e run: throwaway Radicale + same-origin Caddy (:8881) via
# compose, Playwright in Docker (nothing installed on the host). Requires
# Metro running on the host with the same-origin DAV URL (bun run web:proxy).
set -euo pipefail
cd "$(dirname "$0")"

# Must match the @playwright/test version in package.json.
PLAYWRIGHT_TAG=v1.55.0-noble

if ! curl -sf -o /dev/null http://localhost:8081; then
  echo "Metro is not running on :8081. Start it from app/ with:" >&2
  echo "  bun run web:proxy" >&2
  exit 1
fi

# Host timezone (e.g. Asia/Singapore) so 'today' agrees between host, seeded
# fixtures, and the browser.
HOST_TZ=$(readlink /etc/localtime 2>/dev/null | sed 's|.*zoneinfo/||' || true)

docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d
trap 'docker compose down -v >/dev/null 2>&1' EXIT

mkdir -p artifacts
docker run --rm --ipc=host \
  --network hitome-e2e_default \
  -e TZ="${HOST_TZ:-UTC}" \
  -e CI=1 \
  -v "$PWD":/e2e -w /e2e \
  "mcr.microsoft.com/playwright:$PLAYWRIGHT_TAG" \
  bash -c 'npm install --no-audit --no-fund >/dev/null && npx playwright test "$@"' -- "$@"
