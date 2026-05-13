import { timingSafeEqual } from "crypto";
import type { ServerConfig } from "../config";
import type { SecurityHeaders } from "./securityHeaders";

const TOKEN_TTL_MS = 30 * 60_000;
const TOKEN_TTL_S = Math.floor(TOKEN_TTL_MS / 1000);
const RATE_WINDOW_MS = 60_000;
const COOKIE_NAME = "sigint_token";
const CLEANUP_THRESHOLD = 1000;

export type AuthGuards = Readonly<{
  generateToken(): Promise<string>;
  verifyToken(token: string | null): Promise<boolean>;
  tokenCookieHeader(token: string): string;
  expireOldCookieHeader(): string;
  guardRateLimit(req: Request): Response | null;
  guardAuth(req: Request): Promise<Response | null>;
}>;

function getClientIp(req: Request, trustedProxyHops: number): string {
  if (trustedProxyHops === 0) {
    return req.headers.get("x-real-ip") ?? "direct";
  }
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const entries = xff
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length < trustedProxyHops + 1) return "unknown";
  const clientIdx = entries.length - 1 - trustedProxyHops;
  return entries[clientIdx] ?? "unknown";
}

const COOKIE_RE = new RegExp(
  String.raw`(?:^|;\s*)` + COOKIE_NAME + String.raw`=([^;]+)`,
);

function getTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = COOKIE_RE.exec(cookieHeader);
  return match?.[1] ?? null;
}

function expireOldCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0",
  ].join("; ");
}

export function createAuthGuards(
  config: ServerConfig,
  security: SecurityHeaders,
): AuthGuards {
  const { withSecurityHeaders } = security;
  let cryptoKey: CryptoKey | null = null;
  const buckets = new Map<string, number[]>();
  let checksSinceSweep = 0;

  async function getKey(): Promise<CryptoKey> {
    if (cryptoKey) return cryptoKey;
    const encoder = new TextEncoder();
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(config.serverSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    return cryptoKey;
  }

  async function signPayload(payload: string): Promise<string> {
    const key = await getKey();
    const encoder = new TextEncoder();
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return Buffer.from(sig).toString("hex");
  }

  async function generateToken(): Promise<string> {
    const exp = Date.now() + TOKEN_TTL_MS;
    const payload = JSON.stringify({ exp });
    const sig = await signPayload(payload);
    return (
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from(sig).toString("base64url")
    );
  }

  async function verifyToken(token: string | null): Promise<boolean> {
    if (!token) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 2) return false;
      const payload = Buffer.from(parts[0]!, "base64url").toString();
      const sig = Buffer.from(parts[1]!, "base64url").toString();
      const expected = await signPayload(payload);
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

  function tokenCookieHeader(token: string): string {
    const parts = [
      `${COOKIE_NAME}=${token}`,
      "HttpOnly",
      "Path=/api",
      "SameSite=Strict",
      `Max-Age=${TOKEN_TTL_S}`,
    ];
    if (config.isProduction) parts.push("Secure");
    return parts.join("; ");
  }

  function sweepStaleBuckets(now: number): void {
    for (const [key, timestamps] of buckets) {
      const fresh = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
      if (fresh.length === 0) buckets.delete(key);
      else buckets.set(key, fresh);
    }
  }

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    checksSinceSweep++;
    if (checksSinceSweep >= CLEANUP_THRESHOLD) {
      sweepStaleBuckets(now);
      checksSinceSweep = 0;
    }
    const timestamps = buckets.get(ip) ?? [];
    const fresh = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length >= config.rateLimitPerMinute) {
      buckets.set(ip, fresh);
      return false;
    }
    fresh.push(now);
    buckets.set(ip, fresh);
    return true;
  }

  function guardRateLimit(req: Request): Response | null {
    const ip = getClientIp(req, config.trustedProxyHops);
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

  async function guardAuth(req: Request): Promise<Response | null> {
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

  return Object.freeze({
    generateToken,
    verifyToken,
    tokenCookieHeader,
    expireOldCookieHeader,
    guardRateLimit,
    guardAuth,
  });
}
