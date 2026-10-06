// Who is logged in, and with what calendar login. One person per copy of
// hitome, but any number of their browsers, each holding a session token in
// an httpOnly cookie: page code never sees the token, let alone the
// password behind it.
//
// Kept in an encrypted file in the data folder so updates and restarts keep
// people logged in (as Immich keeps its sessions in its database). The key
// sits beside the file, in the same volume: this protects a copied or
// backed-up sessions file, not a stolen volume. Tokens are stored only as
// hashes, so the file alone never yields a working cookie.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type Session = {
  username: string;
  password: string;
  /** When the session began (ms). */
  created: number;
};

type Stored = Record<string, Session>;

const KEY_FILE = 'secret.key';
const SESSIONS_FILE = 'sessions.enc';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readKey(dir: string): Buffer {
  const path = join(dir, KEY_FILE);
  if (existsSync(path)) return readFileSync(path);
  const key = randomBytes(32);
  writeFileSync(path, key, { mode: 0o600 });
  return key;
}

function encrypt(key: Buffer, plain: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(key: Buffer, data: Buffer): string {
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

export type SessionStore = ReturnType<typeof openSessions>;

/** The session store for one data folder (created if missing by the caller). */
export function openSessions(dir: string) {
  const key = readKey(dir);
  const file = join(dir, SESSIONS_FILE);
  let sessions: Stored = {};
  if (existsSync(file)) {
    try {
      sessions = JSON.parse(decrypt(key, readFileSync(file)));
    } catch {
      // Unreadable (a new key, a damaged file): everyone logs in again,
      // which is the honest outcome.
      sessions = {};
    }
  }

  function save(): void {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, encrypt(key, JSON.stringify(sessions)), { mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  }

  return {
    /** Start a session; returns the token for the cookie. */
    create(username: string, password: string): string {
      const token = randomBytes(32).toString('base64url');
      sessions[hashToken(token)] = { username, password, created: Date.now() };
      save();
      return token;
    },
    get(token: string | null | undefined): Session | null {
      if (!token) return null;
      return sessions[hashToken(token)] ?? null;
    },
    end(token: string | null | undefined): void {
      if (!token) return;
      const id = hashToken(token);
      if (!(id in sessions)) return;
      delete sessions[id];
      save();
    },
    /** Log out everywhere. */
    endAll(): void {
      sessions = {};
      save();
    },
    /** Every session holding this login: the calendar stopped accepting it. */
    endFor(username: string, password: string): void {
      const before = Object.keys(sessions).length;
      for (const [id, s] of Object.entries(sessions)) {
        if (s.username === username && s.password === password)
          delete sessions[id];
      }
      if (Object.keys(sessions).length !== before) save();
    },
    count(): number {
      return Object.keys(sessions).length;
    },
  };
}
