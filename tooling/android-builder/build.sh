#!/usr/bin/env bash
# Build the signed release APK in Docker (no host toolchain). See docs/Release.md.
#   ./tooling/android-builder/build.sh   → dist-apk/hitome-v<version>.apk
set -euo pipefail
cd "$(dirname "$0")/../.."

KEYS_DIR="${HITOME_KEYS_DIR:-$HOME/.hitome-keys}"
ENV_FILE=tooling/android-builder/.env
IMAGE=hitome-android-builder:local

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "==> building derived builder image (one-time)"
  docker build --platform linux/amd64 -t "$IMAGE" tooling/android-builder
fi

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE — copy .env.example and set EXPO_PUBLIC_DAV_URL"; exit 1; }
[ -f "$KEYS_DIR/release.keystore" ] || { echo "missing $KEYS_DIR/release.keystore — see docs/Release.md (one-time keygen)"; exit 1; }
[ -f "$KEYS_DIR/keystore.properties" ] || { echo "missing $KEYS_DIR/keystore.properties"; exit 1; }

VERSION=$(bun -e 'console.log(JSON.parse(require("fs").readFileSync("app/app.json","utf8")).expo.version)')
echo "==> building hitome v$VERSION (amd64 container under Rosetta)"

docker run --rm --platform linux/amd64 \
  -v "$PWD/app:/work/app" \
  -v hitome-node-modules:/work/app/node_modules \
  -v "$PWD/tooling/android-builder:/work/tools:ro" \
  -v "$KEYS_DIR:/keys:ro" \
  -v hitome-gradle:/root/.gradle \
  --env-file "$ENV_FILE" \
  "$IMAGE" bash /work/tools/container-build.sh

mkdir -p dist-apk
cp app/android/app/build/outputs/apk/release/app-release.apk "dist-apk/hitome-v$VERSION.apk"
ls -lh "dist-apk/hitome-v$VERSION.apk"
