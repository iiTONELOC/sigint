import { serve } from "bun";
import { join, resolve } from "path";
import { apiRoutes } from "./api";
import { startGdeltPolling } from "./api/gdeltCache";
import { startAisPolling } from "./api/aisCache";
import { startFirmsPolling } from "./api/firmsCache";
import { startNewsPolling } from "./api/newsCache";
import { withSecurityHeaders } from "./api/securityHeaders";
import { createStaticRoutes, safePath } from "./staticRoutes";

const port = Number(process.env.PORT ?? 3000);
const distDir = resolve(import.meta.dir, "../../dist");
const publicDir = resolve(import.meta.dir, "../../public");

const serveDistFile = async (filePath: string): Promise<Response> => {
  const file = Bun.file(filePath);
  if (await file.exists()) return withSecurityHeaders(new Response(file));
  console.warn(`File not found: ${filePath}`);
  return new Response("Not found", { status: 404 });
};

const server = serve({
  hostname: "0.0.0.0",
  port,
  development: false,
  idleTimeout: 30,
  maxRequestBodySize: 1024 * 1024, // 1 MB — all API routes are GET, this is a safety cap
  routes: {
    ...createStaticRoutes(publicDir),

    ...apiRoutes,

    "/*": async (req) => {
      const { pathname } = new URL(req.url);
      const safe = safePath(distDir, pathname);

      if (safe) {
        const file = Bun.file(safe);
        if (await file.exists()) return new Response(file);
      }

      return serveDistFile(join(distDir, "index.html"));
    },
  },
});

const domain = process.env.DOMAIN;
if (domain) {
  console.log(`🚀 Production server running at ${server.url}`);
  console.log(`🔒 Access via https://${domain} (Caddy TLS)`);
} else {
  console.log(`🚀 Production server running at ${server.url}`);
}
startGdeltPolling();
startAisPolling();
startFirmsPolling();
startNewsPolling();
