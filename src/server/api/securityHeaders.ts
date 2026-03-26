// ── Security response headers ────────────────────────────────────────
// Applied to every response. Covers OWASP: HTTP Headers, Clickjacking
// Defense, CSP, XSS Prevention, Transport Layer Security.

const isProd = process.env.NODE_ENV === "production";

// ── Content Security Policy ─────────────────────────────────────────

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://www.planespotters.net https://*.planespotters.net data: blob:",
  [
    "connect-src 'self'",
    "https://opensky-network.org",
    "https://earthquake.usgs.gov",
    "https://api.weather.gov",
    "https://iptv-org.github.io",
  ].join(" "),
  "media-src 'self' https: blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS: [string, string][] = [
  ["Content-Security-Policy", CSP_DIRECTIVES],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-XSS-Protection", "0"],
];

if (isProd) {
  SECURITY_HEADERS.push([
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  ]);
}

/**
 * Apply security headers to a Response.
 * Bun's routes don't support middleware — call this on every response.
 */
export function withSecurityHeaders(response: Response): Response {
  for (const [key, value] of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  return response;
}
