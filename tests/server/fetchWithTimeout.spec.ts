import { afterEach, describe, expect, test } from "bun:test";
import { HttpHeader, HttpStatus } from "@shared/http";
import { MS_PER_SECOND } from "@shared/time";
import {
  FETCH_TIMEOUT_STANDARD_MS,
  UpstreamRefusal,
  UpstreamRetryPolicy,
  fetchJson,
  parseRetryAfter,
  retryDelayMs,
} from "../../src/server/lib/fetchWithTimeout";
import { installFetchMock, type RestoreFetch } from "../support/network";

enum RetryAfterFixture {
  One = 1,
  Ten = 10,
}

enum InvalidRetryAfter {
  Empty = "",
  Negative = "-5",
  Word = "abc",
  Zero = "0",
}

enum FetchFixtureText {
  Url = "https://upstream.test/data",
  Value = "answer",
}

let restoreFetch: RestoreFetch = () => undefined;

function answer(response: Response): void {
  restoreFetch = installFetchMock(async () => response);
}

afterEach(() => {
  restoreFetch();
});

describe("parseRetryAfter", () => {
  test("parses positive integer seconds", () => {
    expect(parseRetryAfter(String(RetryAfterFixture.Ten))).toBe(RetryAfterFixture.Ten);
    expect(parseRetryAfter(String(RetryAfterFixture.One))).toBe(RetryAfterFixture.One);
  });

  test("answers null for a missing, empty, zero, negative or worded header", () => {
    expect(parseRetryAfter(null)).toBeNull();
    for (const header of Object.values(InvalidRetryAfter)) {
      expect(parseRetryAfter(header)).toBeNull();
    }
  });
});

describe("retryDelayMs", () => {
  test("turns the header into milliseconds and falls back to the default delay", () => {
    const told = new Response(null, { headers: { [HttpHeader.RetryAfter]: String(RetryAfterFixture.Ten) } });
    expect(retryDelayMs(told)).toBe(RetryAfterFixture.Ten * MS_PER_SECOND);
    expect(retryDelayMs(new Response(null))).toBe(UpstreamRetryPolicy.DefaultDelayMs);
  });
});

describe("fetchJson", () => {
  test("parses a good answer and reads a missing resource as null", async () => {
    answer(Response.json({ value: FetchFixtureText.Value }));
    expect(await fetchJson<{ value: string }>(FetchFixtureText.Url, FETCH_TIMEOUT_STANDARD_MS)).toEqual({ value: FetchFixtureText.Value });

    answer(new Response(null, { status: HttpStatus.NotFound }));
    expect(await fetchJson(FetchFixtureText.Url, FETCH_TIMEOUT_STANDARD_MS)).toBeNull();
  });

  test("throws a refusal that carries the upstream's wait for 429 and 503", async () => {
    answer(new Response(null, { status: HttpStatus.TooManyRequests, headers: { [HttpHeader.RetryAfter]: String(RetryAfterFixture.One) } }));
    const limited = await fetchJson(FetchFixtureText.Url, FETCH_TIMEOUT_STANDARD_MS).catch((err: unknown) => err);
    expect(limited).toBeInstanceOf(UpstreamRefusal);
    expect((limited as UpstreamRefusal).retryAfterMs).toBe(RetryAfterFixture.One * MS_PER_SECOND);
    expect((limited as UpstreamRefusal).status).toBe(HttpStatus.TooManyRequests);

    answer(new Response(null, { status: HttpStatus.ServiceUnavailable }));
    const down = await fetchJson(FetchFixtureText.Url, FETCH_TIMEOUT_STANDARD_MS).catch((err: unknown) => err);
    expect((down as UpstreamRefusal).retryAfterMs).toBe(UpstreamRetryPolicy.DefaultDelayMs);
  });
});
