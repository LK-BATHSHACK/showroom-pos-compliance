// Edge-runtime-safe (no Node "crypto"/"Buffer") HMAC-signed session cookie
// helpers, used by both middleware.ts and the login/session code that needs
// to run on the edge. Session now carries real per-user identity (uid,
// name, email, role, site) rather than the old hardcoded "marketing" role -
// see lib/auth.ts for the Node-runtime password hashing/verification that
// happens once at login, before this signed cookie gets created.

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function utf8ToBase64Url(str: string): string {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToUtf8(b64url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64url));
}

async function hmac(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}

export const SESSION_COOKIE_NAME = "pos_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type UserRole = "Admin" | "Marketing" | "H&S" | "Store Manager";

export type SessionPayload = {
  uid: string; // Users table record id
  name: string;
  email: string;
  role: UserRole;
  siteId: string | null; // set for Store Manager; null otherwise
  siteName: string | null;
};

export async function createSessionValue(secret: string, payload: SessionPayload, issuedAt: number): Promise<string> {
  const payloadB64 = utf8ToBase64Url(JSON.stringify(payload));
  const signed = `${payloadB64}.${issuedAt}`;
  const sig = await hmac(signed, secret);
  return `${signed}.${sig}`;
}

/** Verifies signature + expiry only - used by middleware, which just needs to know "is this a valid session", not who. */
export async function verifySessionValue(value: string, secret: string): Promise<boolean> {
  return (await decodeSessionValue(value, secret)) !== null;
}

/** Verifies signature + expiry and returns the decoded session, or null if invalid/expired/malformed. Edge-safe. */
export async function decodeSessionValue(value: string, secret: string): Promise<SessionPayload | null> {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [payloadB64, ts, sig] = parts;
  const signed = `${payloadB64}.${ts}`;
  const expected = await hmac(signed, secret);
  if (expected !== sig) return null;
  const age = Date.now() - Number(ts);
  if (isNaN(age) || age > MAX_AGE_MS) return null;
  try {
    return JSON.parse(base64UrlToUtf8(payloadB64)) as SessionPayload;
  } catch {
    return null;
  }
}
