import { serve } from "bun";
import { join, resolve, relative, normalize } from "path";
import { apiRoutes } from "./api";
import { startGdeltPolling } from "./api/gdeltCache";

const port = Number(process.env.PORT ?? 3000);
const distDir = resolve(import.meta.dir, "../../dist");
const publicDir = resolve(import.meta.dir, "../../public");

/**
 * Resolve a URL pathname to a safe filesystem path within `base`.
 * Returns null if the path attempts traversal or contains dangerous chars.
 */
function safePath(base: string, urlPath: string): string | null {
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

const serveFile = async (filePath: string): Promise<Response> => {
  const file = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  console.warn(`File not found: ${filePath}`);
  return new Response("Not found", { status: 404 });
};

async function servePublicFile(pathname: string): Promise<Response> {
  const safe = safePath(publicDir, pathname);
  if (!safe) return new Response("Forbidden", { status: 403 });
  return serveFile(safe);
}

const server = serve({
  hostname: "0.0.0.0",
  port,
  development: false,
  idleTimeout: 30,
  routes: {
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

    ...apiRoutes,

    "/*": async (req) => {
      const { pathname } = new URL(req.url);
      const safe = safePath(distDir, pathname);

      if (safe) {
        const file = Bun.file(safe);
        if (await file.exists()) return new Response(file);
      }

      return serveFile(join(distDir, "index.html"));
    },
  },
});

console.log(`🚀 Production server running at ${server.url}`);
startGdeltPolling();
