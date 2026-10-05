#!/usr/bin/env bash
# Point the Android dev build (com.miraiconcepts.hitome.dev) at this Mac's
# Metro over Tailscale, so it loads anywhere the phone has Tailscale — no
# adb reverse, no shared Wi-Fi. Needs adb once (USB or wireless debugging);
# the setting then survives restarts, but not a reinstall: run it again
# after installing a new dev build.
#
# It writes React Native's own "bundle location" setting (debug_http_host) —
# the same value Dev menu → Change Bundle Location edits on the phone, which
# is the no-adb way to set it.
set -euo pipefail

PKG=com.miraiconcepts.hitome.dev
TS_IP=$(tailscale ip -4 2>/dev/null || /Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4)
HOST="${TS_IP}:8081"

adb shell am force-stop "$PKG"
adb shell "run-as $PKG sh -c 'cat > shared_prefs/${PKG}_preferences.xml'" <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="debug_http_host">${HOST}</string>
</map>
XML
echo "dev build now loads from ${HOST}"
echo "start Metro with: cd app && bun run start:tailscale"
