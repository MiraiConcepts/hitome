#!/usr/bin/env bash
# Sign the CI-built APK locally and publish the GitHub Release.
#   ./tooling/android-builder/sign-release.sh
# Prereqs: a successful "Android APK" workflow run; ~/.hitome-keys (keystore +
# keystore.properties); gh + docker. The keystore never leaves this machine.
set -euo pipefail
cd "$(dirname "$0")/../.."

KEYS_DIR="${HITOME_KEYS_DIR:-$HOME/.hitome-keys}"
[ -f "$KEYS_DIR/release.keystore" ] || { echo "missing $KEYS_DIR/release.keystore"; exit 1; }

# Tag to sign+publish: explicit arg (e.g. `sign-release.sh v0.2.6`) or derived
# from app.json — the arg matters when app.json has moved on to a -web patch.
TAG="${1:-v$(bun -e 'console.log(JSON.parse(require("fs").readFileSync("app/app.json","utf8")).expo.version)')}"

echo "==> fetching latest successful Android APK workflow artifact"
RUN=$(gh run list --workflow 'Android APK' --status success -L 1 --json databaseId -q '.[0].databaseId')
[ -n "$RUN" ] || { echo "no successful 'Android APK' run found"; exit 1; }
rm -rf dist-apk && mkdir -p dist-apk
gh run download "$RUN" -n hitome-unsigned-apk -D dist-apk
[ -f "dist-apk/hitome-$TAG-unsigned.apk" ] || {
  echo "artifact version mismatch: expected hitome-$TAG-unsigned.apk, got:"; ls dist-apk; exit 1; }

echo "==> signing locally (temurin JRE container; keystore stays on this machine)"
# shellcheck disable=SC1091
source "$KEYS_DIR/keystore.properties"
docker run --rm -v "$PWD/dist-apk:/w" -v "$KEYS_DIR:/keys:ro" -w /w eclipse-temurin:17-jre \
  java -jar apksigner.jar sign \
    --ks /keys/release.keystore --ks-key-alias "$keyAlias" \
    --ks-pass "pass:$storePassword" --key-pass "pass:$keyPassword" \
    --out "hitome-$TAG.apk" "hitome-$TAG-unsigned.apk"

echo "==> verify signature"
# Capture instead of piping to head: SIGPIPE from an early-exiting reader would
# abort the script under pipefail AFTER verify but BEFORE publish.
docker run --rm -v "$PWD/dist-apk:/w" -w /w eclipse-temurin:17-jre \
  java -jar apksigner.jar verify --print-certs "hitome-$TAG.apk" > dist-apk/verify.txt
head -3 dist-apk/verify.txt
# The same key as every earlier release (Android refuses an update signed by
# another, and the key cannot be rotated): stop before publishing otherwise.
EXPECTED_CERT_SHA256=37ba82efa8b49ca541d39ec343987ae4be0c65b7f1de8811c262571b73676d36
grep -qi "certificate SHA-256 digest: $EXPECTED_CERT_SHA256" dist-apk/verify.txt || {
  echo "signed with a different certificate than the earlier releases" >&2
  exit 1
}

echo "==> publishing release $TAG"
gh release create "$TAG" "dist-apk/hitome-$TAG.apk" \
  --title "hitome $TAG" --generate-notes
echo "==> done: $(gh release view "$TAG" --json url -q .url)"
