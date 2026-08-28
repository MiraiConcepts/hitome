// Adjust signing in the expo-prebuild-generated android/app/build.gradle.
// Prebuild regenerates that file every build, so this patch is applied each time.
//
//   default:     wire release signing to the HITOME_* env vars (local Docker builds)
//   --unsigned:  strip signing from the release buildType entirely — Gradle then
//                emits app-release-unsigned.apk (CI builds; signing happens locally
//                afterwards via sign-release.sh)
//
// Fails loudly if the template shape drifts — never silently ships a debug-signed APK.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
const unsigned = process.argv.includes('--unsigned');
if (!path) throw new Error('usage: node patch-signing.mjs <build.gradle> [--unsigned]');
let gradle = readFileSync(path, 'utf8');

// The template signs BOTH buildTypes with signingConfigs.debug; the release
// buildType's occurrence is the last one.
const needle = 'signingConfig signingConfigs.debug';
const last = gradle.lastIndexOf(needle);
const occurrences = gradle.split(needle).length - 1;
if (last === -1) throw new Error('no debug signingConfig reference found');
if (occurrences > 2) throw new Error(`unexpected template: ${occurrences} debug signing refs`);

if (unsigned) {
  gradle = gradle.slice(0, last) + gradle.slice(last + needle.length);
  writeFileSync(path, gradle);
  console.log(`patched ${path}: release buildType is UNSIGNED (signed later, locally)`);
} else {
  const releaseConfig = `signingConfigs {
        release {
            storeFile file(System.getenv("HITOME_STORE_FILE"))
            storePassword System.getenv("HITOME_STORE_PASSWORD")
            keyAlias System.getenv("HITOME_KEY_ALIAS")
            keyPassword System.getenv("HITOME_KEY_PASSWORD")
        }`;
  if (!gradle.includes('signingConfigs {')) throw new Error('signingConfigs block not found');
  gradle = gradle.replace('signingConfigs {', releaseConfig);
  const relast = gradle.lastIndexOf(needle);
  gradle =
    gradle.slice(0, relast) +
    'signingConfig signingConfigs.release' +
    gradle.slice(relast + needle.length);
  writeFileSync(path, gradle);
  console.log(`patched ${path}: release buildType signs with HITOME_* keystore`);
}
