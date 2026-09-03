# Release — one cut ships both channels (web + Android, versions in parity)

> Releases are **symmetric** (decided 2026-07-07): pushes to `main` only run CI
> checks; a `v*` tag fires BOTH the web image and the Android APK from the same
> commit, so both platforms always carry the same version (visible in the
> in-app version badge, bottom-right). Android lands as a signed arm64-v8a APK
> on a GitHub Release, tracked by
> [Obtainium](https://github.com/ImranR98/Obtainium); web lands as
> `ghcr.io/miraiconcepts/hitome:latest`, deployed by Watchtower.

## Architecture (locked 2026-07-06)

- **arm64-v8a only**: the New Architecture compiles C++ from source once per ABI, so
  a four-ABI universal APK pays that three extra times for architectures nothing here
  runs (both the phone and the Apple Silicon emulator are arm64). Set with
  `-PreactNativeArchitectures=arm64-v8a` on the CI gradle step — a flag, not an edit to
  the prebuild-regenerated `gradle.properties`, so local `android:dev` is unaffected.
  Reverting to universal means dropping the flag. A release APK will not install on an
  x86_64 emulator.
- **CI builds AND signs** (reversed 2026-09-03): GitHub Actions
  (`.github/workflows/android-apk.yml`) builds the APK on real x86_64 Linux — the
  canonical platform — signs it, and publishes the GitHub Release. A tag is the
  whole release; nothing is done by hand. This adopts the Memoka model
  (`KEYSTORE_BASE64` secret) and **reverses the 2026-07-06 decision** to keep key
  custody local, which cost one manual command per release.
  - Repo secrets required: `KEYSTORE_BASE64` (base64 of `release.keystore`),
    `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
  - The unsigned APK is still uploaded as an artifact, so
    `tooling/android-builder/sign-release.sh` stays a working fallback for a run
    whose signing step failed, or a release that needs re-cutting by hand.
  - What this costs: GitHub now holds a copy of the signing key. It is the one
    credential that cannot be rotated — Android only installs updates signed by
    the same key — so the local backup in `~/.hitome-keys/` matters more, not
    less. The CalDAV invariant is untouched: **no server credentials in CI, the
    repo, images, bundles or devices**, ever.
- **Baked server URL** ("option 1"): the APK ships `EXPO_PUBLIC_DAV_URL` baked from
  the repo Actions **variable** `HITOME_DAV_URL` — a variable, not a secret: the
  ts.net hostname is already public via Certificate Transparency, and the origin is
  unreachable off-tailnet (server-verified; Funnel off). URL/port change ⇒ new release.
- **Signing keystore**: `~/.hitome-keys/` (`release.keystore` + `keystore.properties`),
  NEVER in git. ⚠️ **Back it up** — Android only installs updates signed by the same
  key; losing it means uninstall/reinstall + Obtainium re-add.
- APKs contain **no credentials** (server-side injection — `docs/Deploy.md`).

## Cutting a release

1. Batch changes on `main` until the set feels release-worthy (CI checks every
   push; nothing deploys).
2. Bump **both** in `app/app.json`: `expo.version` (e.g. `0.3.0`) and
   `expo.android.versionCode` (+1 — Android refuses same-code updates).
3. Commit + push, then tag:
   ```sh
   git tag v0.3.0 && git push origin main v0.3.0
   ```
   The tag fires **both** workflows (`Android APK` + `Web image`) from the same
   commit. Wait for green (`gh run watch`).
4. Nothing. The tag's workflow signs the APK and creates the GitHub Release
   itself, verifying the signature and the baked URL before it publishes.
5. Obtainium picks up the APK on its next poll; Watchtower deploys the web image
   on its next cycle. Verify parity via the version badge on both.

If the signing step ever fails, the unsigned artifact is still uploaded and
`./tooling/android-builder/sign-release.sh` finishes the job from this machine —
it downloads the artifact, signs with `~/.hitome-keys` in a JRE container,
verifies signature + baked URL, and creates the Release.

`gh workflow run 'Android APK'` / `'Web image'` (workflow_dispatch) still exist
for untagged smoke builds — they publish nothing user-facing on their own
(Watchtower does follow `:latest`, so dispatching Web image deploys; prefer tags).

## Web-only releases (fast lane)

For web-only iteration, skip the APK cost: bump `expo.version` to a suffixed
patch on the current release (e.g. `0.2.6` → `0.2.6-web.1`; leave `versionCode`
alone), commit, then:

```sh
git tag v0.2.6-web.1 && git push origin main v0.2.6-web.1
```

The `-web` suffix makes the Android workflow skip itself; only the web image
builds and deploys. The version badge makes the divergence visible (web
`0.2.6-web.1`, phone `0.2.6`) — deliberate, not drift. The next full release
(e.g. `v0.2.7`) re-syncs both channels. Never run `sign-release.sh` for a
web-only cut.

## Phone setup (one-time)

Install Obtainium (F-Droid) → **Add App** → source URL `https://github.com/MiraiConcepts/hitome`
→ install. Updates arrive as notifications thereafter.

## Fallback: fully local Docker build (no GitHub)

`./tooling/android-builder/build.sh` builds AND signs entirely on this machine
(derived multiarch image: x86 Android tools under Rosetta + native arm64 Node; Maven
mirror for Sonatype IP blocks; needs colima ≥10 GB). Status: debugged through all
known failure layers but not yet proven end-to-end — prefer the CI path.

## Notes

- One-time repo setup already done: Actions variable `HITOME_DAV_URL`; keystore
  generated 2026-07-06.
- `dist-apk/`, `app/android/`, and the builder `.env` are gitignored/disposable.
- Revisit triggers for the baked-URL decision: Funnel ever enabled, tailnet gains
  users, or URL churn (→ switch to first-run URL entry; design shelved in
  `.claude/plans/settings-page-plan.md`).
