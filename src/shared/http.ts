export enum HttpHeader {
  Accept = "Accept",
  AcceptEncoding = "accept-encoding",
  CacheControl = "Cache-Control",
  Cookie = "cookie",
  ContentEncoding = "Content-Encoding",
  ContentType = "Content-Type",
  ETag = "etag",
  IfModifiedSince = "If-Modified-Since",
  IfNoneMatch = "If-None-Match",
  LastModified = "last-modified",
  RetryAfter = "retry-after",
  ServiceWorkerAllowed = "Service-Worker-Allowed",
  SetCookie = "Set-Cookie",
  UserAgent = "User-Agent",
  XForwardedFor = "x-forwarded-for",
  XRealIp = "x-real-ip",
}

export enum HttpMediaType {
  GeoJson = "application/geo+json",
  Json = "application/json",
}

export enum HttpMethod {
  Get = "GET",
}

export enum HttpStatus {
  Ok = 200,
  NotModified = 304,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  TooManyRequests = 429,
  InternalServerError = 500,
  ServiceUnavailable = 503,
}

export enum HttpContentCoding {
  Gzip = "gzip",
}

/** Gunzip a byte stream to text. */
export function gunzipText(stream: ReadableStream<BufferSource>): Promise<string> {
  return new Response(
    stream.pipeThrough(new DecompressionStream(HttpContentCoding.Gzip)),
  ).text();
}

/** Gzip text to bytes. */
export async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream()
    .pipeThrough(new CompressionStream(HttpContentCoding.Gzip));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export enum HttpUserAgent {
  SigintDashboard = "(sigint-dashboard, osint-tool)",
  SigintRepository = "(sigint-dashboard, https://github.com/iitoneloc/sigint)",
}

export const AUTH_TOKEN_ROUTE = "/api/auth/token";
