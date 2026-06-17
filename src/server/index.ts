import { serve } from "bun";
import { resolve } from "path";
import index from "../index.html";
import { loadConfig, ConfigError } from "./config";
import { createApiRoutes } from "./api";
import { createAuthGuards } from "./api/auth";
import { createSecurityHeaders } from "./api/securityHeaders";
import { startAllPolling } from "./startPolling";
import { createStaticRoutes } from "./staticRoutes";
import { createLogger } from "./lib/logger";

const logger = createLogger({ service: "server-dev" });

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

const publicDir = resolve(import.meta.dir, "../../public");

const server = serve({
  hostname: "0.0.0.0",
  port: config.port,
  maxRequestBodySize: 1024 * 1024,
  routes: {
    ...createStaticRoutes(publicDir, security),
    ...apiRoutes,
    "/*": index,
  },
  development: !config.isProduction && {
    hmr: true,
    console: true,
  },
});

logger.info(`🚀 Dev server running at ${server.url}`);
logger.info(`🔒 Access via https://localhost (Caddy reverse proxy)`);
startAllPolling(config);
