import { describe, test, expect } from "bun:test";

const ICAO24_RE = /^[0-9a-f]{6}$/i;
const CALLSIGN_RE = /^[A-Z0-9]{2,10}$/i;
const ICAO_AIRPORT_RE = /^[A-Z]{4}$/i;

function sanitizeIcao24(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return ICAO24_RE.test(cleaned) ? cleaned : null;
}
function sanitizeCallsign(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  return CALLSIGN_RE.test(cleaned) ? cleaned : null;
}
function sanitizeIcaoAirport(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  return ICAO_AIRPORT_RE.test(cleaned) ? cleaned : null;
}
function formatDelay(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m late`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m late` : `${hrs}h late`;
}
function createCache() {
  const cache = new Map<string, { data: unknown; expiresAt: number }>();
  return {
    get<T>(key: string): T | null {
      const e = cache.get(key);
      if (!e) return null;
      if (Date.now() > e.expiresAt) {
        cache.delete(key);
        return null;
      }
      return e.data as T;
    },
    set(key: string, data: unknown, ttl: number) {
      cache.set(key, { data, expiresAt: Date.now() + ttl });
    },
  };
}

describe("sanitizeIcao24", () => {
  test("accepts valid hex", () => {
    expect(sanitizeIcao24("abc123")).toBe("abc123");
  });
  test("lowercases", () => {
    expect(sanitizeIcao24("ABC123")).toBe("abc123");
  });
  test("trims", () => {
    expect(sanitizeIcao24("  abc123  ")).toBe("abc123");
  });
  test("rejects short", () => {
    expect(sanitizeIcao24("abc")).toBeNull();
  });
  test("rejects long", () => {
    expect(sanitizeIcao24("abc12345")).toBeNull();
  });
  test("rejects non-hex", () => {
    expect(sanitizeIcao24("xyz123")).toBeNull();
  });
  test("rejects traversal", () => {
    expect(sanitizeIcao24("../../xx")).toBeNull();
  });
});

describe("sanitizeCallsign", () => {
  test("accepts valid", () => {
    expect(sanitizeCallsign("UAL123")).toBe("UAL123");
  });
  test("uppercases", () => {
    expect(sanitizeCallsign("ual123")).toBe("UAL123");
  });
  test("rejects short", () => {
    expect(sanitizeCallsign("A")).toBeNull();
  });
  test("rejects long", () => {
    expect(sanitizeCallsign("ABCDEFGHIJK")).toBeNull();
  });
  test("rejects special chars", () => {
    expect(sanitizeCallsign("UAL-123")).toBeNull();
  });
  test("rejects spaces", () => {
    expect(sanitizeCallsign("UAL 123")).toBeNull();
  });
});

describe("sanitizeIcaoAirport", () => {
  test("accepts valid", () => {
    expect(sanitizeIcaoAirport("KJFK")).toBe("KJFK");
  });
  test("uppercases", () => {
    expect(sanitizeIcaoAirport("kjfk")).toBe("KJFK");
  });
  test("rejects 3 chars", () => {
    expect(sanitizeIcaoAirport("JFK")).toBeNull();
  });
  test("rejects 5 chars", () => {
    expect(sanitizeIcaoAirport("KJFKX")).toBeNull();
  });
  test("rejects digits", () => {
    expect(sanitizeIcaoAirport("K1FK")).toBeNull();
  });
});

describe("formatDelay", () => {
  test("minutes", () => {
    expect(formatDelay(900)).toBe("15m late");
  });
  test("hours", () => {
    expect(formatDelay(3600)).toBe("1h late");
  });
  test("hours and minutes", () => {
    expect(formatDelay(5400)).toBe("1h 30m late");
  });
  test("rounds", () => {
    expect(formatDelay(125)).toBe("2m late");
  });
});

describe("TTL cache", () => {
  test("miss returns null", () => {
    expect(createCache().get("x")).toBeNull();
  });
  test("hit returns value", () => {
    const c = createCache();
    c.set("k", { v: 1 }, 60000);
    expect(c.get<{ v: number }>("k")!.v).toBe(1);
  });
  test("expired returns null", () => {
    const c = createCache();
    c.set("k", "val", -1);
    expect(c.get("k")).toBeNull();
  });
});
