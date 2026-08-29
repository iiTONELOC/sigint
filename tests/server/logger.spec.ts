import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createLogger, LogLevel, REDACTED } from "../../src/server/lib/logger";

// ── Capture sink for assertions (Writer-shaped) ─────────────────────
// The logger writes to a sink that conforms to the WritableStream-ish
// `{ write(chunk: Uint8Array): Promise<void> }` contract. Tests use an
// in-memory sink that accumulates bytes for assertion.

function createCaptureSink(): {
  write(chunk: Uint8Array): Promise<void>;
  lines(): Array<Record<string, unknown>>;
  raw(): string;
} {
  const chunks: Uint8Array[] = [];
  return {
    async write(chunk: Uint8Array): Promise<void> {
      chunks.push(chunk);
    },
    lines(): Array<Record<string, unknown>> {
      const text = new TextDecoder().decode(
        new Uint8Array(chunks.reduce<number[]>((acc, c) => acc.concat([...c]), [])),
      );
      return text
        .split("\n")
        .filter((s) => s.length > 0)
        .map((s) => JSON.parse(s) as Record<string, unknown>);
    },
    raw(): string {
      return new TextDecoder().decode(
        new Uint8Array(chunks.reduce<number[]>((acc, c) => acc.concat([...c]), [])),
      );
    },
  };
}

describe("logger: structured JSON output", () => {
  test("emits one JSON object per call, separated by newline", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("first");
    log.warn("second");
    log.error("third");
    await Promise.resolve();
    const lines = sink.lines();
    expect(lines).toHaveLength(3);
  });

  test("every entry has level, service, message, timestamp", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("hello");
    const [entry] = sink.lines();
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("info");
    expect(entry!.service).toBe("test");
    expect(entry!.message).toBe("hello");
    expect(typeof entry!.timestamp).toBe("string");
    // ISO-8601 UTC
    expect(entry!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("merges custom fields into the entry", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("request handled", {
      requestId: "abc-123",
      actorId: "user-1",
      statusCode: 200,
      durationMs: 42,
    });
    const [entry] = sink.lines();
    expect(entry!.requestId).toBe("abc-123");
    expect(entry!.actorId).toBe("user-1");
    expect(entry!.statusCode).toBe(200);
    expect(entry!.durationMs).toBe(42);
  });
});

describe("logger: level filter", () => {
  const levels = Object.values(LogLevel);

  for (const min of levels) {
    test(`level "${min}" filters out lower levels`, async () => {
      const sink = createCaptureSink();
      const log = createLogger({ service: "test", level: min, sink });
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");
      const lines = sink.lines();
      const expectedCount = 4 - levels.indexOf(min);
      expect(lines).toHaveLength(expectedCount);
    });
  }
});

describe("logger: redaction (§9.1)", () => {
  test("redacts forbidden top-level keys: token, password, apiKey, etc.", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("auth event", {
      token: "secret-token",
      password: "hunter2",
      apiKey: "ak_123",
      authorization: "Bearer xyz",
      cookie: "sigint_token=abc",
      secret: "shhh",
      refreshToken: "rt_456",
      // benign fields pass through
      actorId: "user-1",
    });
    const [entry] = sink.lines();
    expect(entry!.token).toBe(REDACTED);
    expect(entry!.password).toBe(REDACTED);
    expect(entry!.apiKey).toBe(REDACTED);
    expect(entry!.authorization).toBe(REDACTED);
    expect(entry!.cookie).toBe(REDACTED);
    expect(entry!.secret).toBe(REDACTED);
    expect(entry!.refreshToken).toBe(REDACTED);
    expect(entry!.actorId).toBe("user-1");
  });

  test("redacts forbidden keys case-insensitively", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("ev", {
      TOKEN: "x",
      Password: "y",
      Authorization: "z",
    });
    const [entry] = sink.lines();
    expect(entry!.TOKEN).toBe(REDACTED);
    expect(entry!.Password).toBe(REDACTED);
    expect(entry!.Authorization).toBe(REDACTED);
  });

  test("redacts nested keys one level deep", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("ev", {
      meta: { token: "x", actorId: "u" },
    });
    const [entry] = sink.lines();
    const meta = entry!.meta as Record<string, unknown>;
    expect(meta.token).toBe(REDACTED);
    expect(meta.actorId).toBe("u");
  });

  test("never logs the message itself if it contains a forbidden substring", async () => {
    // Per §9.1, full request bodies and tokens must never appear in
    // logs. The message string itself is checked for cookie patterns.
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    log.info("got cookie sigint_token=abc123 from client");
    const [entry] = sink.lines();
    expect(entry!.message).not.toContain("abc123");
  });
});

describe("logger: error class capture", () => {
  test("captures errorClass when an Error is passed via the error field", async () => {
    const sink = createCaptureSink();
    const log = createLogger({ service: "test", level: LogLevel.Debug, sink });
    class DependencyError extends Error {}
    log.error("dep failed", { error: new DependencyError("upstream 500") });
    const [entry] = sink.lines();
    expect(entry!.errorClass).toBe("DependencyError");
    expect(entry!.errorMessage).toBe("upstream 500");
    // The error object itself is NOT included verbatim (stack leak risk).
    expect(entry!.error).toBeUndefined();
  });
});

describe("logger: sink failure tolerance", () => {
  test("a sink that throws does not propagate to the caller", async () => {
    const throwingSink = {
      async write(): Promise<void> {
        throw new Error("disk full");
      },
    };
    const log = createLogger({
      service: "test",
      level: LogLevel.Debug,
      sink: throwingSink,
    });
    // Logging failures do not affect the caller.
    expect(() => log.info("hello")).not.toThrow();
  });
});

describe("logger: default sink is stderr-compatible", () => {
  test("createLogger with no sink uses stderr without throwing", () => {
    // This test cannot intercept stderr. It verifies construction and use.
    // construction must succeed and the returned logger must be callable.
    const log = createLogger({ service: "test", level: LogLevel.Error });
    expect(() => log.error("ping")).not.toThrow();
  });
});
