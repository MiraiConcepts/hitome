# Repo Initialization — Implementation Plan
Created: 2026-06-11 · Revised: 2026-06-11 (minimal-first)
Status: COMPLETE (executed 2026-06-11)

## Summary
All six steps done. Expo SDK 56 scaffold in `app/` (TS strict, Expo Router,
RN Web included by default); ESLint (expo flat config + prettier) / Prettier /
jest-expo wired with typecheck/lint/test/format scripts; bun-based CI at
`.github/workflows/ci.yml`; repo pushed to the parent repo
(public, MIT). Smoke: web `expo export` builds all routes; app rendered in
Android emulator via Expo Go (bundled 4.4s).

Deviations:
- Rewrote `src/hooks/use-color-scheme.web.ts` to `useSyncExternalStore` —
  template's setState-in-effect violates current react-hooks lint rule.
- Added committed `app/types.d.ts` referencing `expo/types` — the generated
  `expo-env.d.ts` is gitignored, so CI typecheck needs a stable stand-in.
- Added `types: ["jest"]` to tsconfig + a real first unit (`src/utils/note-id`)
  so the test runner proves itself on real code.
- Removed `app/LICENSE` (was Expo's own 650 Industries license, not ours).

## Context
Kick-start the note-taking app from Requirements.md: minimal repo + toolchain
setup only. User decisions: **bun** as package manager, **public** GitHub repo
named for the parent app, and no feature libraries yet — bare scaffold first. Stack
for later phases remains as decided in Requirements.md §9.

## Approach — minimal initialization steps

| # | Step | What |
|---|------|------|
| 0 | Verify versions | Confirm current Expo SDK + bun compatibility (bun is a supported Expo package manager) — nothing pinned from memory |
| 1 | Init repo + GitHub | `git init`, `.gitignore`, README, license; `gh repo create <repo> --public` |
| 2 | Layout | `app/` (Expo client) · `docs/` (Requirements.md moves here) · `.claude/` (plans) · `server/` left as a stub README |
| 3 | Scaffold client | `bun create expo` TypeScript template, Expo Router, RN Web enabled; no extra dependencies |
| 4 | Dev tooling | TS strict, ESLint + Prettier, jest-expo, bun scripts (typecheck / lint / test) |
| 5 | CI | GitHub Actions (bun-based): typecheck + lint + test on push/PR |
| 6 | Smoke + first push | App boots on web and Android emulator; initial commit pushed to the parent repo |

## Deferred (next phases, in rough order)
- Feature libraries: yjs, Tiptap + y-prosemirror, y-indexeddb, op-sqlite +
  y-op-sqlite, react-native-skia, y-sweet client, polyfills, expo-secure-store,
  expo-notifications — install only when the feature that needs them starts.
- Server stack: docker-compose with y-sweet + MinIO (nothing to sync until the
  yjs client exists).
- Android release pipeline: eas.json (buildType apk), keystore, APK-to-GitHub-
  Releases workflow for Obtainium.
- Web deploy stub and the Y.Doc end-to-end sync smoke test.

## Risks & Open Questions
- bun + Expo: supported, but step 0 confirms the current `bun create expo` /
  Metro story before relying on it.
- Public repo will contain Requirements.md — it describes a personal setup
  (self-hosted server, Tailscale). No secrets, but be aware it's world-readable.
