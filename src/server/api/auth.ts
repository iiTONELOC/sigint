// ── Server auth + rate limiting ──────────────────────────────────────
// HMAC-SHA256 token generation/verification via Web Crypto API (async).
// Token is set as an HttpOnly Secure cookie — never exposed to JS.
// Verification uses crypto.timingSafeEqual for constant-time comparison.
// Per-IP sliding window rate limiter applied to ALL routes.

import { timingSafeEqual } from "crypto";
import { withSecurityHeaders } from "./securityHeaders";

// ── Config ───────────────────────────────────────────────────────────

const SERVER_SECRET = process.env.SIGINT_SERVER_SECRET;
if (!SERVER_SECRET) {
  throw new Error(
    "SIGINT_SERVER_SECRET env var is required. Generate with: openssl rand -hex 32",
  );
}

const TOKEN_TTL_MS = 30 * 60_000;
const TOKEN_TTL_S = Math.floor(TOKEN_TTL_MS / 1000);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60; // requests per minute per IP

const COOKIE_NAME = "sigint_token";

// ── Crypto key (imported once, reused) ──────────────────────────────

let cryptoKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey;
  const encoder = new TextEncoder();
  cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SERVER_SECRET as string),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cryptoKey;
}

// ── Token generation (async) ─────────────────────────────────────────

async function signPayload(payload: string): Promise<string> {
  const key = await getKey();
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(sig).toString("hex");
}

export async function generateToken(): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = JSON.stringify({ exp });
  const sig = await signPayload(payload);
  return (
    Buffer.from(payload).toString("base64url") +
    "." +
    Buffer.from(sig).toString("base64url")
  );
}

/**
 * Build Set-Cookie header value for the auth token.
 * HttpOnly — not accessible from JS.
 * Secure — only sent over HTTPS.
 * SameSite=Strict — not sent on cross-origin requests.
 * Path=/api — scoped to API routes only.
 */
export function tokenCookieHeader(token: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/api",
    "SameSite=Strict",
    `Max-Age=${TOKEN_TTL_S}`,
  ];
  if (!isDev) parts.push("Secure");
  return parts.join("; ");
}

// ── Token verification (async, constant-time) ────────────────────────

export async function verifyToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const payload = Buffer.from(parts[0]!, "base64url").toString();
    const sig = Buffer.from(parts[1]!, "base64url").toString();

    const expected = await signPayload(payload);

    // Constant-time comparison — prevents timing attacks
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

    const parsed = JSON.parse(payload);
    if (typeof parsed.exp !== "number") return false;
    if (Date.now() > parsed.exp) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Cookie parsing ──────────────────────────────────────────────────

function getTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  return match?.[1] ?? null;
}

// ── Rate limiting (per-IP sliding window) ────────────────────────────

const buckets = new Map<string, number[]>();

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    const fresh = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, 5 * 60_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = buckets.get(ip) ?? [];
  const fresh = timestamps.filter((t) => now - t < RATE_WINDOW_MS);

  if (fresh.length >= RATE_LIMIT) {
    buckets.set(ip, fresh);
    return false;
  }

  fresh.push(now);
  buckets.set(ip, fresh);
  return true;
}

// ── Request guards ───────────────────────────────────────────────────

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function guardRateLimit(req: Request): Response | null {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return withSecurityHeaders(
      Response.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    );
  }
  return null;
}

// Rate limit + token auth — reads token from HttpOnly cookie
export async function guardAuth(req: Request): Promise<Response | null> {
  const rateLimited = guardRateLimit(req);
  if (rateLimited) return rateLimited;

  const token = getTokenFromCookie(req);
  if (!(await verifyToken(token))) {
    return withSecurityHeaders(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }
  return null;
}
