enum HttpUrlScheme {
  Http = "http://",
  Https = "https://",
}
/** Return true when a detail value uses an HTTP or HTTPS scheme. */
export function isHttpUrl(value: string): boolean {
  return (
    value.startsWith(HttpUrlScheme.Http) ||
    value.startsWith(HttpUrlScheme.Https)
  );
}
