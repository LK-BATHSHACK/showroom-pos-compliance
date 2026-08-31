// Node-runtime auth helpers: password hashing/verification (PBKDF2 via
// Node's built-in "crypto", not Web Crypto - this file is never imported by
// middleware.ts, which stays edge-only and uses lib/auth-edge.ts instead)
// and a getSession() helper for Server Components / API routes to read the
// signed session cookie and get back real user identity + role + site.
//
// Replaces the old single-shared-password model (APP_PASSWORD env var) with
// per-user accounts stored in the Users table. See "Users" table in the
// Airtable base for the schema.

import { cookies } from "next/headers";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { SESSION_COOKIE_NAME, decodeSessionValue, type SessionPayload, type UserRole } from "./auth-edge";

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  if (!iterations || !salt.length || !expected.length) return false;
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Generates a random human-typeable temp password, e.g. for newly-created accounts. */
export function generateTempPassword(): string {
  // Avoid visually-ambiguous characters (0/O, 1/l/I).
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Reads and verifies the session cookie for use in Server Components / API routes (Node runtime). Returns null if not logged in or session invalid/expired. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!cookie || !secret) return null;
  return decodeSessionValue(cookie, secret);
}

/** Throws-free guard: returns the session if the user is logged in and their role is one of `roles`, otherwise null. Callers decide what to do (redirect, 403 JSON, etc). */
export async function requireRole(roles: UserRole[]): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (!roles.includes(session.role)) return null;
  return session;
}

export type { SessionPayload, UserRole };
