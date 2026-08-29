import { serve } from "bun";
import { join, resolve } from "path";
import { createApiRoutes } from "./api";
import { createAuthGuards } from "./api/auth";
import { createSecurityHeaders, type SecurityHeaders } from "./api/securityHeaders";
import { ConfigError, loadConfig, type ServerConfig } from "./config";
import { createLogger, type Logger } from "./lib/logger";
import { startAllPolling } from "./startPolling";
import { createStaticRoutes, safePath, staticNotFoundResponse } from "./staticRoutes";

export enum ServerMode {
  Development = "dev",
  Production = "prod",
}

const CONFIG_ERROR_EXIT_CODE = 78;
const PRODUCTION_IDLE_TIMEOUT_SECONDS = 30;
const MAXIMUM_REQUEST_BODY_BYTES = 1_048_576;

const SERVER_STATIC_DIRECTORY = {
  [ServerMode.Development]: "../../public",
  [ServerMode.Production]: "../../dist",
};

function readConfig(logger: Logger): ServerConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    logger.error("Server configuration error", { errorMessage: error.message });
    process.exit(CONFIG_ERROR_EXIT_CODE);
  }
}

async function serveProductionFallback(
  request: Request,
  distDirectory: string,
  security: SecurityHeaders,
  logger: Logger,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const requestedPath = safePath(distDirectory, pathname);
  if (requestedPath) {
    const file = Bun.file(requestedPath);
    if (await file.exists()) return new Response(file);
  }

  const indexPath = join(distDirectory, "index.html");
  const indexFile = Bun.file(indexPath);
  if (await indexFile.exists()) {
    return security.withSecurityHeaders(new Response(indexFile));
  }
  logger.warn(`File not found: ${indexPath}`);
  return staticNotFoundResponse();
}

export async function startServer(mode: ServerMode): Promise<void> {
  const production = mode === ServerMode.Production;
  const logger = createLogger({ service: `server-${mode}` });
  const config = readConfig(logger);
  const security = createSecurityHeaders(config);
  const authGuards = createAuthGuards(config, security);
  const apiRoutes = createApiRoutes({ authGuards, security });
  const staticDirectory = resolve(import.meta.dir, SERVER_STATIC_DIRECTORY[mode]);
  const fallback = production
    ? (request: Request) =>
        serveProductionFallback(request, staticDirectory, security, logger)
    : (await import("../index.html")).default;

  const server = serve({
    hostname: "0.0.0.0",
    port: config.port,
    maxRequestBodySize: MAXIMUM_REQUEST_BODY_BYTES,
    routes: {
      ...createStaticRoutes(staticDirectory, security, !production),
      ...apiRoutes,
      "/*": fallback,
    },
    development: production
      ? false
      : !config.isProduction && { hmr: true, console: true },
    ...(production ? { idleTimeout: PRODUCTION_IDLE_TIMEOUT_SECONDS } : {}),
  });

  logger.info(`🚀 ${production ? "Production" : "Dev"} server running at ${server.url}`);
  if (production && config.domain) {
    logger.info(`🔒 Access via https://${config.domain} (Caddy TLS)`);
  } else if (!production) {
    logger.info("🔒 Access via https://localhost (Caddy reverse proxy)");
  }
  startAllPolling(config);
}

if (import.meta.main) await startServer(ServerMode.Development);
