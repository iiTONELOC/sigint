import { HttpProtocol } from "@shared/http";

/** Return true when a detail value uses an HTTP or HTTPS scheme. */
export function isHttpUrl(value: string): boolean {
  return (
    value.startsWith(`${HttpProtocol.Http}//`) ||
    value.startsWith(`${HttpProtocol.Https}//`)
  );
}
