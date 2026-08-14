// Edge-runtime-safe (no Node "crypto"/"Buffer") HMAC-signed session cookie
// helpers, used by both middleware.ts and the login API route.

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}

export const SESSION_COOKIE_NAME = "pos_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function createSessionValue(secret: string, issuedAt: number): Promise<string> {
  const payload = `marketing.${issuedAt}`;
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionValue(value: string, secret: string): Promise<boolean> {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [role, ts, sig] = parts;
  const payload = `${role}.${ts}`;
  const expected = await hmac(payload, secret);
  if (expected !== sig) return false;
  const age = Date.now() - Number(ts);
  return !isNaN(age) && age <= MAX_AGE_MS;
}
