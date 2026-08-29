import { describe, test, expect } from "bun:test";
import { loadConfig, ConfigError } from "../../src/server/config";

const VALID_SECRET = "a".repeat(64);

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    SIGINT_SERVER_SECRET: VALID_SECRET,
    ...overrides,
  };
}

describe("loadConfig: happy path", () => {
  test("returns a config with all fields populated", () => {
    const cfg = loadConfig(
      baseEnv({
        NODE_ENV: "production",
        PORT: "5500",
        SIGINT_RATE_LIMIT_PER_MINUTE: "120",
        SIGINT_TRUSTED_PROXY_HOPS: "1",
        AISSTREAM_API_KEY: "ais-key",
        DOMAIN: "example.com",
      }),
    );
    expect(cfg.serverSecret).toBe(VALID_SECRET);
    expect(cfg.isProduction).toBe(true);
    expect(cfg.port).toBe(5500);
    expect(cfg.rateLimitPerMinute).toBe(120);
    expect(cfg.trustedProxyHops).toBe(1);
    expect(cfg.aisstreamApiKey).toBe("ais-key");
    expect(cfg.domain).toBe("example.com");
  });

  test("returns a Readonly object; mutation throws in strict mode", () => {
    const cfg = loadConfig(baseEnv());
    expect(() => {
      (cfg as { port: number }).port = 9999;
    }).toThrow();
  });
});

describe("loadConfig: defaults", () => {
  test("port defaults to 5500", () => {
    expect(loadConfig(baseEnv()).port).toBe(5500);
  });

  test("rateLimitPerMinute defaults to 60", () => {
    expect(loadConfig(baseEnv()).rateLimitPerMinute).toBe(60);
  });

  test("trustedProxyHops defaults to 0", () => {
    expect(loadConfig(baseEnv()).trustedProxyHops).toBe(0);
  });

  test("isProduction defaults to false when NODE_ENV unset", () => {
    expect(loadConfig(baseEnv()).isProduction).toBe(false);
  });

  test("isProduction false for any non-production NODE_ENV", () => {
    expect(loadConfig(baseEnv({ NODE_ENV: "development" })).isProduction).toBe(
      false,
    );
    expect(loadConfig(baseEnv({ NODE_ENV: "test" })).isProduction).toBe(false);
    expect(loadConfig(baseEnv({ NODE_ENV: "" })).isProduction).toBe(false);
  });

  test("optional secrets are undefined when not set", () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.aisstreamApiKey).toBeUndefined();
    expect(cfg.domain).toBeUndefined();
  });

  test("fixtureOverridesEnabled is true when not production", () => {
    expect(loadConfig(baseEnv()).fixtureOverridesEnabled).toBe(true);
    expect(
      loadConfig(baseEnv({ NODE_ENV: "development" })).fixtureOverridesEnabled,
    ).toBe(true);
  });

  test("fixtureOverridesEnabled is false in production", () => {
    expect(
      loadConfig(baseEnv({ NODE_ENV: "production" })).fixtureOverridesEnabled,
    ).toBe(false);
  });
});

describe("loadConfig: serverSecret validation", () => {
  test("throws ConfigError when SIGINT_SERVER_SECRET missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  test("throws ConfigError when SIGINT_SERVER_SECRET empty", () => {
    expect(() => loadConfig({ SIGINT_SERVER_SECRET: "" })).toThrow(ConfigError);
  });

  test("throws ConfigError when SIGINT_SERVER_SECRET too short (<32 chars)", () => {
    expect(() => loadConfig({ SIGINT_SERVER_SECRET: "a".repeat(31) })).toThrow(
      ConfigError,
    );
  });

  test("accepts SIGINT_SERVER_SECRET exactly 32 chars", () => {
    expect(loadConfig({ SIGINT_SERVER_SECRET: "a".repeat(32) }).serverSecret)
      .toHaveLength(32);
  });

  test("ConfigError message does not echo the secret value", () => {
    try {
      loadConfig({ SIGINT_SERVER_SECRET: "secret-leak-canary" });
      throw new Error("expected ConfigError");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as Error).message).not.toContain("secret-leak-canary");
    }
  });
});

describe("loadConfig: port validation", () => {
  test("parses numeric PORT", () => {
    expect(loadConfig(baseEnv({ PORT: "8080" })).port).toBe(8080);
  });

  test("throws ConfigError on non-numeric PORT", () => {
    expect(() => loadConfig(baseEnv({ PORT: "abc" }))).toThrow(ConfigError);
  });

  test("throws ConfigError on zero PORT", () => {
    expect(() => loadConfig(baseEnv({ PORT: "0" }))).toThrow(ConfigError);
  });

  test("throws ConfigError on negative PORT", () => {
    expect(() => loadConfig(baseEnv({ PORT: "-1" }))).toThrow(ConfigError);
  });

  test("throws ConfigError on out-of-range PORT", () => {
    expect(() => loadConfig(baseEnv({ PORT: "65536" }))).toThrow(ConfigError);
  });

  test("throws ConfigError on fractional PORT", () => {
    expect(() => loadConfig(baseEnv({ PORT: "55.5" }))).toThrow(ConfigError);
  });
});

describe("loadConfig: rateLimitPerMinute validation", () => {
  test("parses numeric value", () => {
    expect(
      loadConfig(baseEnv({ SIGINT_RATE_LIMIT_PER_MINUTE: "200" }))
        .rateLimitPerMinute,
    ).toBe(200);
  });

  test("throws ConfigError on non-numeric value", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_RATE_LIMIT_PER_MINUTE: "fast" })),
    ).toThrow(ConfigError);
  });

  test("throws ConfigError on zero", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_RATE_LIMIT_PER_MINUTE: "0" })),
    ).toThrow(ConfigError);
  });

  test("throws ConfigError on negative", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_RATE_LIMIT_PER_MINUTE: "-5" })),
    ).toThrow(ConfigError);
  });

  test("throws ConfigError on fractional", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_RATE_LIMIT_PER_MINUTE: "10.5" })),
    ).toThrow(ConfigError);
  });
});

describe("loadConfig: trustedProxyHops validation", () => {
  test("parses zero (direct source IP)", () => {
    expect(
      loadConfig(baseEnv({ SIGINT_TRUSTED_PROXY_HOPS: "0" })).trustedProxyHops,
    ).toBe(0);
  });

  test("parses positive integers", () => {
    expect(
      loadConfig(baseEnv({ SIGINT_TRUSTED_PROXY_HOPS: "2" })).trustedProxyHops,
    ).toBe(2);
  });

  test("throws ConfigError on negative", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_TRUSTED_PROXY_HOPS: "-1" })),
    ).toThrow(ConfigError);
  });

  test("throws ConfigError on non-numeric", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_TRUSTED_PROXY_HOPS: "two" })),
    ).toThrow(ConfigError);
  });

  test("throws ConfigError on fractional", () => {
    expect(() =>
      loadConfig(baseEnv({ SIGINT_TRUSTED_PROXY_HOPS: "1.5" })),
    ).toThrow(ConfigError);
  });
});

describe("ConfigError class", () => {
  test("is an Error subclass", () => {
    expect(new ConfigError({
      kind: ConfigErrorKind.Required,
      field: ConfigField.ServerSecret,
    })).toBeInstanceOf(Error);
  });

  test("has name 'ConfigError'", () => {
    expect(new ConfigError({
      kind: ConfigErrorKind.Required,
      field: ConfigField.ServerSecret,
    }).name).toBe("ConfigError");
  });
});
import { ConfigErrorKind, ConfigField } from "../../src/server/config";
