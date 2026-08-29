import { basename, normalize, relative, resolve } from "path";
import { HttpHeader, HttpStatus } from "@shared/http";
import type { SecurityHeaders } from "./api/securityHeaders";
import { createLogger } from "./lib/logger";

const logger = createLogger({ service: "static-routes" });

const WORKER_SRC_DIR = resolve(import.meta.dir, "../client/workers");
const NO_CACHE_POLICY = "no-cache, must-revalidate";
const WORKER_BUILD_FAILED_MESSAGE = "Worker build failed";

const STATIC_ROUTE_FAILURES = {
  AccessDenied: { body: "Forbidden", status: HttpStatus.Forbidden },
  MissingFile: { body: "Not found", status: HttpStatus.NotFound },
};

type StaticRouteFailure = (typeof STATIC_ROUTE_FAILURES)[keyof typeof STATIC_ROUTE_FAILURES];

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
  const [output] = built.outputs;
  if (built.success && output) {
    return new Response(await output.text(), {
      headers: {
        [HttpHeader.ContentType]: "text/javascript; charset=utf-8",
        [HttpHeader.CacheControl]: NO_CACHE_POLICY,
      },
    });
  }

  const logs = built.logs.map((log) => log.message).join("\n");
  logger.error(WORKER_BUILD_FAILED_MESSAGE, {
    buildLogs: logs, worker: `${name}.ts`,
  });
  return new Response(logs, {
    status: HttpStatus.InternalServerError,
    headers: { [HttpHeader.ContentType]: "text/plain; charset=utf-8" },
  });
}

function staticErrorResponse(failure: StaticRouteFailure): Response {
  return new Response(failure.body, { status: failure.status });
}

export function staticNotFoundResponse(): Response {
  return staticErrorResponse(STATIC_ROUTE_FAILURES.MissingFile);
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

export function createStaticFileServer(
  staticDir: string,
  security: SecurityHeaders,
): (pathname: string) => Promise<Response> {
  const { withSecurityHeaders } = security;
  return async function serveStaticFile(pathname: string): Promise<Response> {
    const safe = safePath(staticDir, pathname);
    if (!safe) {
      return staticErrorResponse(STATIC_ROUTE_FAILURES.AccessDenied);
    }

    const file = Bun.file(safe);
    if (!(await file.exists())) return staticNotFoundResponse();

    return withSecurityHeaders(new Response(file));
  };
}

export function createStaticRoutes(
  staticDir: string,
  security: SecurityHeaders,
  buildWorkersFromSource = true,
): Record<string, (request: Request) => Promise<Response>> {
  const serveStaticFile = createStaticFileServer(staticDir, security);
  const serveRequestedStaticFile = (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    return serveStaticFile(pathname);
  };

  return {
    "/fonts.css": serveRequestedStaticFile,
    "/fonts/*": serveRequestedStaticFile,
    "/data/*": serveRequestedStaticFile,

    "/workers/*": async (request) => {
      const { pathname } = new URL(request.url);
      if (!buildWorkersFromSource) return serveStaticFile(pathname);
      return (await buildWorkerFromTs(pathname)) ?? serveStaticFile(pathname);
    },

    "/sw.js": async (request) => {
      const response = await serveRequestedStaticFile(request);
      response.headers.set(HttpHeader.CacheControl, NO_CACHE_POLICY);
      response.headers.set(HttpHeader.ServiceWorkerAllowed, "/");
      return response;
    },

    "/manifest.json": serveRequestedStaticFile,
    "/icons/*": serveRequestedStaticFile,
  };
}
