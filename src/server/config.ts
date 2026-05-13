export type ServerConfig = Readonly<{
  serverSecret: string;
  isProduction: boolean;
  port: number;
  rateLimitPerMinute: number;
  trustedProxyHops: number;
  aisstreamApiKey: string | undefined;
  firmsMapKey: string | undefined;
  domain: string | undefined;
  fixtureOverridesEnabled: boolean;
}>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type EnvMap = Readonly<Record<string, string | undefined>>;

const MIN_SECRET_LENGTH = 32;
const DEFAULT_PORT = 5500;
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_TRUSTED_PROXY_HOPS = 0;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const INT_RE = /^-?\d+$/;

function parsePositiveInt(
  value: string,
  field: string,
  min: number,
  max: number,
): number {
  if (!INT_RE.test(value)) {
    throw new ConfigError(`${field} must be an integer`);
  }
  const n = Number.parseInt(value, 10);
  if (n < min || n > max) {
    throw new ConfigError(`${field} must be between ${min} and ${max}`);
  }
  return n;
}

function parseNonNegativeInt(value: string, field: string): number {
  if (!INT_RE.test(value)) {
    throw new ConfigError(`${field} must be an integer`);
  }
  const n = Number.parseInt(value, 10);
  if (n < 0) {
    throw new ConfigError(`${field} must be non-negative`);
  }
  return n;
}

function readOptional(env: EnvMap, key: string): string | undefined {
  const v = env[key];
  return v && v.length > 0 ? v : undefined;
}

export function loadConfig(env: EnvMap): ServerConfig {
  const serverSecret = env.SIGINT_SERVER_SECRET ?? "";
  if (serverSecret.length === 0) {
    throw new ConfigError("SIGINT_SERVER_SECRET is required");
  }
  if (serverSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(
      `SIGINT_SERVER_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }

  const isProduction = env.NODE_ENV === "production";

  const port = env.PORT
    ? parsePositiveInt(env.PORT, "PORT", MIN_PORT, MAX_PORT)
    : DEFAULT_PORT;

  const rateLimitPerMinute = env.SIGINT_RATE_LIMIT_PER_MINUTE
    ? parsePositiveInt(
        env.SIGINT_RATE_LIMIT_PER_MINUTE,
        "SIGINT_RATE_LIMIT_PER_MINUTE",
        1,
        Number.MAX_SAFE_INTEGER,
      )
    : DEFAULT_RATE_LIMIT;

  const trustedProxyHops = env.SIGINT_TRUSTED_PROXY_HOPS
    ? parseNonNegativeInt(
        env.SIGINT_TRUSTED_PROXY_HOPS,
        "SIGINT_TRUSTED_PROXY_HOPS",
      )
    : DEFAULT_TRUSTED_PROXY_HOPS;

  return Object.freeze({
    serverSecret,
    isProduction,
    port,
    rateLimitPerMinute,
    trustedProxyHops,
    aisstreamApiKey: readOptional(env, "AISSTREAM_API_KEY"),
    firmsMapKey: readOptional(env, "FIRMS_MAP_KEY"),
    domain: readOptional(env, "DOMAIN"),
    fixtureOverridesEnabled: !isProduction,
  });
}
