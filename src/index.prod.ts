import { serve } from "bun";
import { join, resolve, relative, normalize } from "path";
import { apiRoutes } from "./api";

const port = Number(process.env.PORT ?? 3000);
const distDir = resolve(import.meta.dir, "../dist");
const publicDir = resolve(import.meta.dir, "../public");

const serveFile = async (filePath: string): Promise<Response> => {
  const file = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  console.warn(`File not found: ${filePath}`);
  return new Response("Not found", { status: 404 });
};

function safePath(base: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  const normalized = normalize(decoded);
  const resolved = resolve(base, "." + normalized);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.includes("\0")) return null;
  return resolved;
}

const server = serve({
  hostname: "0.0.0.0",
  port,
  development: false,
  idleTimeout: 30,
  routes: {
    "/fonts.css": async () => {
      return serveFile(join(publicDir, "fonts.css"));
    },

    "/fonts/*": async (req) => {
      const { pathname } = new URL(req.url);
      const safe = safePath(publicDir, pathname);
      if (!safe) return new Response("Forbidden", { status: 403 });
      return serveFile(safe);
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
