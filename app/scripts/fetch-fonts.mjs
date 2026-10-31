// Satoshi, fetched from Fontshare rather than kept in the repository: its
// licence (ITF Free Font Licence, fontshare.com/licenses/itf-ffl) lets the
// app embed the font but not publish the font files, and this repository is
// public. Runs after every install (package.json postinstall), and does
// nothing when the three files are already in assets/fonts.
//
// Plain Node or Bun with no dependencies: the download is a zip, and the
// three faces are read straight out of it with zlib.
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'fonts'
);
const URL = 'https://api.fontshare.com/v2/fonts/download/satoshi';

/** Each face as the app loads it, by the file it is in the download. */
const FACES = {
  'Satoshi.otf': 'Satoshi-Regular.otf',
  'Satoshi_medium.otf': 'Satoshi-Medium.otf',
  'Satoshi_bold.otf': 'Satoshi-Bold.otf',
};

if (Object.keys(FACES).every((name) => existsSync(join(DIR, name)))) {
  process.exit(0);
}

const res = await fetch(URL);
if (!res.ok) {
  console.error(`fetch-fonts: Fontshare answered ${res.status} for ${URL}`);
  process.exit(1);
}
const zip = Buffer.from(await res.arrayBuffer());

/** The zip's files by name, from its central directory (sizes there are
 *  reliable even when the local headers defer them). */
function entries(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    out.set(name, { method, size, local });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

function read(buf, { method, size, local }) {
  const start =
    local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip compression ${method}`);
}

const files = entries(zip);
mkdirSync(DIR, { recursive: true });
for (const [name, source] of Object.entries(FACES)) {
  const found = [...files.keys()].find((f) => f.endsWith(`/OTF/${source}`));
  if (!found) {
    console.error(`fetch-fonts: ${source} is not in Fontshare's download`);
    process.exit(1);
  }
  writeFileSync(join(DIR, name), read(zip, files.get(found)));
}
console.log('fetch-fonts: Satoshi downloaded from Fontshare');
