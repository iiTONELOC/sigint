import { resolve, relative, normalize } from "path";
import type { SecurityHeaders } from "./api/securityHeaders";

export function safePath(base: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const normalized = normalize(decoded);
  const resolved = resolve(base, "." + normalized);
  const rel = relative(base, resolved);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) return null;
  return resolved;
}

export function createPublicFileServer(
  publicDir: string,
  security: SecurityHeaders,
) {
  const { withSecurityHeaders } = security;
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

export function createStaticRoutes(
  publicDir: string,
  security: SecurityHeaders,
): Record<string, (req: Request) => Promise<Response>> {
  const servePublicFile = createPublicFileServer(publicDir, security);

  return {
    "/fonts.css": async () => servePublicFile("/fonts.css"),

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
      const res = await servePublicFile("/sw.js");
      res.headers.set("Cache-Control", "no-cache, must-revalidate");
      res.headers.set("Service-Worker-Allowed", "/");
      return res;
    },

    "/manifest.json": async () => servePublicFile("/manifest.json"),

    "/icons/*": async (req) => {
      const { pathname } = new URL(req.url);
      return servePublicFile(pathname);
    },
  };
}
