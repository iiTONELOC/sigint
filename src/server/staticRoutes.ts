import { resolve, relative, normalize } from "path";
import { withSecurityHeaders } from "./api/securityHeaders";

/**
 * Resolve a URL pathname to a safe filesystem path within `base`.
 * Returns null if the path attempts traversal or contains dangerous chars.
 */
export function safePath(base: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  // Reject any path containing traversal sequences after decode
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const normalized = normalize(decoded);
  const resolved = resolve(base, "." + normalized);
  // Belt-and-suspenders: verify resolved path is still inside base
  const rel = relative(base, resolved);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) return null;
  return resolved;
}

/**
 * Create a function that serves files from `publicDir` with security headers.
 */
export function createPublicFileServer(publicDir: string) {
  return async function servePublicFile(pathname: string): Promise<Response> {
    const safe = safePath(publicDir, pathname);
    if (!safe) return new Response("Forbidden", { status: 403 });

    const file = Bun.file(safe);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return withSecurityHeaders(new Response(file));
  };
}

/**
 * Build the static route map shared by dev and prod servers.
 * Returns a routes object to spread into Bun.serve({ routes }).
 */
export function createStaticRoutes(
  publicDir: string,
): Record<string, (req: Request) => Promise<Response>> {
  const servePublicFile = createPublicFileServer(publicDir);

  return {
    "/fonts.css": async () => {
      return servePublicFile("/fonts.css");
    },

    "/fonts/*": async (req) => {
      const { pathname } = new URL(req.url);
      return servePublicFile(pathname);
    },

    "/data/*": async (req) => {
      const { pathname } = new URL(req.url);
      return servePublicFile(pathname);
    },

    "/workers/*": async (req) => {
      const { pathname } = new URL(req.url);
      return servePublicFile(pathname);
    },

    "/sw.js": async () => {
      // Service workers MUST be served with no-cache so the browser
      // always byte-compares against the network copy on each update
      // check. Without this, an HTTP-cached sw.js can keep returning
      // visitors stuck on the old worker for hours (or until the
      // browser's HTTP cache heuristic decides to revalidate).
      const res = await servePublicFile("/sw.js");
      res.headers.set("Cache-Control", "no-cache, must-revalidate");
      res.headers.set("Service-Worker-Allowed", "/");
      return res;
    },

    "/manifest.json": async () => {
      return servePublicFile("/manifest.json");
    },

    "/icons/*": async (req) => {
      const { pathname } = new URL(req.url);
      return servePublicFile(pathname);
    },
  };
}
