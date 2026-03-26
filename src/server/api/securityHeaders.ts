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
    "https://opensky-network.org", // Aircraft positions (client-side fetch)
    "https://earthquake.usgs.gov", // Seismic data (client-side fetch)
    "https://api.weather.gov", // NOAA alerts (client-side fetch)
    "https://iptv-org.github.io", // IPTV channel/stream index JSON
    // HLS.js fetches .m3u8 manifests and .ts segments via fetch() from
    // arbitrary IPTV CDNs (cloudfront, akamai, herring, etc). These domains
    // change as iptv-org updates their stream list — can't be enumerated.
    // Tighten to specific CDN domains if channel list is ever pinned.
    "https:",
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
