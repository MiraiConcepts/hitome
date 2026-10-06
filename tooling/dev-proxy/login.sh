#!/usr/bin/env bash
# Sign the local dev proxy in to your real Radicale, once.
#
# The web app never holds a login (see docs/Deploy.md): the proxy in front of
# it adds one to every /dav/ request. This asks for that login in the terminal
# (the password is not shown), saves it to this folder's gitignored .env as
# RADICALE_BASIC_B64, restarts the proxy and checks the server accepts it.
# Run it again whenever the password changes.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Set RADICALE_ORIGIN in it if it is not right."
fi

read -r -p "Radicale username: " user
read -r -s -p "Password: " pass
echo

b64=$(printf '%s:%s' "$user" "$pass" | base64 | tr -d '\n')
unset pass

# Replace the line, or add it if the file has none. No sed: the value would
# land in the process list.
tmp=$(mktemp)
grep -v '^RADICALE_BASIC_B64=' .env >"$tmp" || true
printf 'RADICALE_BASIC_B64=%s\n' "$b64" >>"$tmp"
mv "$tmp" .env
chmod 600 .env
unset b64

# Recreate (not restart) so the container reads the new .env.
docker compose up -d --force-recreate >/dev/null 2>&1
sleep 1

status=$(curl -s -o /dev/null -w '%{http_code}' -X PROPFIND -H 'Depth: 0' http://localhost:4000/dav/ || true)
case "$status" in
  207) echo "Signed in. Open http://localhost:4000" ;;
  401 | 403) echo "Radicale turned that login down (HTTP $status). Run this again." >&2; exit 1 ;;
  *) echo "Saved, but the check got HTTP $status. Is Radicale reachable over Tailscale?" >&2; exit 1 ;;
esac
