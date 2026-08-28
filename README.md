# hitome

Personal, single-user calendar for Android and web, backed by self-hosted
Radicale over CalDAV. Includes an Android home-screen agenda widget and exact
alarms for event reminders.

Split out of [mitsume](https://github.com/MiraiConcepts/mitsume), which keeps the
notes canvas.

- **Client:** [`app/`](app/) — Expo / React Native (+ React Native Web), TypeScript
- **Deploy:** [docs/Deploy.md](docs/Deploy.md)
- **Release:** [docs/Release.md](docs/Release.md)

## Development

```sh
cd app
bun install
bun run web:proxy   # Metro on :8082; browse the dev proxy at :8882
bun run typecheck
bun run lint
bun test $(find src -name '*.test.ts')
```

## Distribution

Android ships as a universal APK attached to GitHub Releases, tracked by
[Obtainium](https://github.com/ImranR98/Obtainium). Web deploys to the
self-hosted environment via `ghcr.io/miraiconcepts/hitome`.
