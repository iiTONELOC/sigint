import { serve } from "bun";
import { resolve, relative, normalize } from "path";
import index from "../index.html";
import { apiRoutes } from "./api";
import { startGdeltPolling } from "./api/gdeltCache";
import { startAisPolling } from "./api/aisCache";

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

async function servePublicFile(pathname: string): Promise<Response> {
  const safe = safePath(publicDir, pathname);
  if (!safe) return new Response("Forbidden", { status: 403 });

  const file = Bun.file(safe);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file);
}

const server = serve({
  hostname: "localhost",
  port: 3000,
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

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
startGdeltPolling();
startAisPolling();
