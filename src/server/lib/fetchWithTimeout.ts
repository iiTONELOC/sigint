import { HttpHeader, HttpStatus } from "@shared/http";
import { MS_PER_SECOND } from "@shared/time";

export const FETCH_TIMEOUT_STANDARD_MS = 8_000;
export const FETCH_TIMEOUT_LARGE_MS = 30_000;
export const FETCH_TIMEOUT_FLIGHTAWARE_MS = 2_500;

export enum UpstreamRetryPolicy {
  DefaultDelayMs = 30_000,
}

const REFUSAL_STATUSES: ReadonlySet<number> = new Set([
  HttpStatus.TooManyRequests,
  HttpStatus.ServiceUnavailable,
]);

export class UpstreamRefusal extends Error {
  readonly status: number;
  readonly retryAfterMs: number;

  constructor(status: number, retryAfterMs: number) {
    super(`HTTP ${status}`);
    this.name = UpstreamRefusal.name;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

export function retryDelayMs(response: Response): number {
  const seconds = parseRetryAfter(response.headers.get(HttpHeader.RetryAfter));
  return seconds === null
    ? UpstreamRetryPolicy.DefaultDelayMs
    : seconds * MS_PER_SECOND;
}

export async function fetchJson<T>(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  if (REFUSAL_STATUSES.has(response.status)) {
    throw new UpstreamRefusal(response.status, retryDelayMs(response));
  }
  return response.ok ? ((await response.json()) as T) : null;
}
