import { serve } from "bun";
import { join, resolve } from "path";
import { loadConfig, ConfigError } from "./config";
import { createApiRoutes } from "./api";
import { createAuthGuards } from "./api/auth";
import { createSecurityHeaders } from "./api/securityHeaders";
import { startAllPolling } from "./startPolling";
import { createStaticRoutes, safePath } from "./staticRoutes";
import { createLogger } from "./lib/logger";

const logger = createLogger({ service: "server-prod" });

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    logger.error("Server configuration error", { errorMessage: err.message });
    process.exit(78);
  }
  throw err;
}

const security = createSecurityHeaders(config);
const authGuards = createAuthGuards(config, security);
const apiRoutes = createApiRoutes({ authGuards, security });

const distDir = resolve(import.meta.dir, "../../dist");

const serveDistFile = async (filePath: string): Promise<Response> => {
  const file = Bun.file(filePath);
  if (await file.exists()) return security.withSecurityHeaders(new Response(file));
  logger.warn(`File not found: ${filePath}`);
  return new Response("Not found", { status: 404 });
};

const server = serve({
  hostname: "0.0.0.0",
  port: config.port,
  development: false,
  idleTimeout: 30,
  maxRequestBodySize: 1024 * 1024,
  routes: {
    ...createStaticRoutes(distDir, security, { buildWorkersFromSource: false }),
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

if (config.domain) {
  logger.info(`🚀 Production server running at ${server.url}`);
  logger.info(`🔒 Access via https://${config.domain} (Caddy TLS)`);
} else {
  logger.info(`🚀 Production server running at ${server.url}`);
}
startAllPolling(config);
