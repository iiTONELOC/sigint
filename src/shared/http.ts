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

export enum HttpUserAgent {
  SigintDashboard = "(sigint-dashboard, osint-tool)",
}

export const AUTH_TOKEN_ROUTE = "/api/auth/token";
