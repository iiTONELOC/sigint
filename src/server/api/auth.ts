// ── Server auth + rate limiting ──────────────────────────────────────
// HMAC-SHA256 token generation/verification.
// Per-IP sliding window rate limiter applied to ALL routes.
// Token auth applied to protected routes only.

import { createHmac } from "crypto";

// ── Config ───────────────────────────────────────────────────────────

const SERVER_SECRET = process.env.SIGINT_SERVER_SECRET;
if (!SERVER_SECRET) {
  throw new Error(
    "SIGINT_SERVER_SECRET env var is required. Generate with: openssl rand -hex 32",
  );
}

const TOKEN_TTL_MS = 30 * 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60; // requests per minute per IP

// ── Token generation ─────────────────────────────────────────────────

function signPayload(payload: string): string {
  return createHmac("sha256", SERVER_SECRET as string)
    .update(payload)
    .digest("hex");
}

export function generateToken(): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = JSON.stringify({ exp });
  const sig = signPayload(payload);
  return (
    Buffer.from(payload).toString("base64url") +
    "." +
    Buffer.from(sig).toString("base64url")
  );
}

// ── Token verification ───────────────────────────────────────────────

export function verifyToken(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const payload = Buffer.from(parts[0]!, "base64url").toString();
    const sig = Buffer.from(parts[1]!, "base64url").toString();

    const expected = signPayload(payload);
    if (expected.length !== sig.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (mismatch !== 0) return false;

    const parsed = JSON.parse(payload);
    if (typeof parsed.exp !== "number") return false;
    if (Date.now() > parsed.exp) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Rate limiting (per-IP sliding window) ────────────────────────────

const buckets = new Map<string, number[]>();

// Purge stale buckets every 5 minutes
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

// Rate limit only — for token endpoint
export function guardRateLimit(req: Request): Response | null {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  return null;
}

// Rate limit + token auth — for all protected routes
export function guardAuth(req: Request): Response | null {
  const rateLimited = guardRateLimit(req);
  if (rateLimited) return rateLimited;

  const token = req.headers.get("X-SIGINT-Token");
  if (!verifyToken(token)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
