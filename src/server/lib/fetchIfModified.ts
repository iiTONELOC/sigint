import { HttpHeader } from "@shared/http";
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "./fetchWithTimeout";

export type ResponseValidators = { lastModified: string | null; etag: string | null };

/** Validators remembered per key (a storm id, a feed URL). */
export type ValidatorStore = Map<string, ResponseValidators>;

type ConditionalFetchOptions = { timeoutMs?: number; headers?: Record<string, string> };

/** Fetch with the stored validators for `key`; remember the new ones on a 2xx. */
export async function fetchIfModified(
  url: string,
  key: string,
  store: ValidatorStore,
  options: ConditionalFetchOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  const known = store.get(key);
  if (known?.lastModified) headers[HttpHeader.IfModifiedSince] = known.lastModified;
  if (known?.etag) headers[HttpHeader.IfNoneMatch] = known.etag;
  const response = await fetchWithTimeout(
    url, options.timeoutMs ?? FETCH_TIMEOUT_STANDARD_MS, { headers },
  );
  if (response.ok) {
    store.set(key, {
      lastModified: response.headers.get(HttpHeader.LastModified),
      etag: response.headers.get(HttpHeader.ETag),
    });
  }
  return response;
}
