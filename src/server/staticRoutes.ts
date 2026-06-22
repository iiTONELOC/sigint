import { resolve, relative, normalize, basename } from "path";
import type { SecurityHeaders } from "./api/securityHeaders";

const WORKER_SRC_DIR = resolve(import.meta.dir, "../client/workers");

async function buildWorkerFromTs(pathname: string): Promise<Response | null> {
  if (!pathname.endsWith(".js")) return null;
  const name = basename(pathname, ".js");
  const entry = resolve(WORKER_SRC_DIR, `${name}.ts`);
  if (!(await Bun.file(entry).exists())) return null;
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
  });
  if (!built.success || built.outputs.length === 0) return null;
  const code = await built.outputs[0]!.text();
  return new Response(code, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}

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
      const built = await buildWorkerFromTs(pathname);
      return built ?? servePublicFile(pathname);
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
