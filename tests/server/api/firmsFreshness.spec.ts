import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HttpHeader, HttpStatus } from "@shared/http";
import { MS_PER_DAY, MS_PER_HOUR } from "@shared/time";
import {
  fetchFirms,
  getFirmsCache,
  __resetFirmsCacheForTests,
} from "../../../src/server/api/firmsCache";

const ETAG = "\"feed-v1\"";
const realFetch = globalThis.fetch;
let requests: string[] = [];
let feedDown = false;

function csvAt(time: number): string {
  const iso = new Date(time).toISOString();
  const date = iso.slice(0, 10);
  const hhmm = iso.slice(11, 13) + iso.slice(14, 16);
  return `latitude,longitude,bright_ti4,acq_date,acq_time,frp\n10.5,20.5,330,${date},${hhmm},12\n`;
}

beforeEach(() => {
  requests = [];
  feedDown = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push(`${url}|${headers.get(HttpHeader.IfNoneMatch) ?? ""}`);
    if (feedDown) return new Response("down", { status: HttpStatus.ServiceUnavailable });
    if (headers.get(HttpHeader.IfNoneMatch) === ETAG) return new Response(null, { status: HttpStatus.NotModified });
    return new Response(csvAt(Date.now() - MS_PER_HOUR), { headers: { [HttpHeader.ETag]: ETAG } });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetFirmsCacheForTests();
});

describe("fetchFirms freshness", () => {
  test("an unchanged feed is revalidated with one conditional request and keeps its data", async () => {
    await fetchFirms();
    expect(getFirmsCache().fireCount).toBe(1);
    requests = [];
    await fetchFirms();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.endsWith(`|${ETAG}`)).toBe(true);
    expect(getFirmsCache().fireCount).toBe(1);
  });

  test("never serves detections older than the feed's 24 hour window", async () => {
    await fetchFirms();
    expect(getFirmsCache(Date.now() + MS_PER_DAY).fireCount).toBe(0);
  });

  test("during an outage keeps only in-window detections and reports the error", async () => {
    await fetchFirms();
    feedDown = true;
    await fetchFirms();
    const cache = getFirmsCache();
    expect(cache.fireCount).toBe(1);
    expect(cache.error).not.toBeNull();
    expect(getFirmsCache(Date.now() + MS_PER_DAY).fireCount).toBe(0);
  });
});
