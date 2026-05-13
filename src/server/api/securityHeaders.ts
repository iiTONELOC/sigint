import type { ServerConfig } from "../config";

const STATIC_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://www.planespotters.net https://*.planespotters.net https://*.plnspttrs.net data: blob:",
  [
    "connect-src 'self'",
    "https://earthquake.usgs.gov",
    "https://api.weather.gov",
    "https://iptv-org.github.io",
    "https:",
  ].join(" "),
  "media-src 'self' https: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export type SecurityHeaders = Readonly<{
  withSecurityHeaders(response: Response): Response;
  cspDirectives: string;
}>;

export function createSecurityHeaders(config: ServerConfig): SecurityHeaders {
  const headers: ReadonlyArray<readonly [string, string]> = Object.freeze([
    ["Content-Security-Policy", STATIC_CSP_DIRECTIVES],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
    ["X-XSS-Protection", "0"],
    ...(config.isProduction
      ? ([
          [
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
          ] as const,
        ] as const)
      : ([] as const)),
  ]);

  function withSecurityHeaders(response: Response): Response {
    for (const [key, value] of headers) {
      response.headers.set(key, value);
    }
    return response;
  }

  return Object.freeze({
    withSecurityHeaders,
    cspDirectives: STATIC_CSP_DIRECTIVES,
  });
}
