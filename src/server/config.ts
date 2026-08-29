export type ServerConfig = Readonly<{
  serverSecret: string;
  isProduction: boolean;
  port: number;
  rateLimitPerMinute: number;
  trustedProxyHops: number;
  aisstreamApiKey: string | undefined;
  domain: string | undefined;
  fixtureOverridesEnabled: boolean;
}>;

export enum ConfigField {
  AircraftFixture = "AIRCRAFT_FIXTURE",
  CyclonesFixture = "CYCLONES_FIXTURE",
  Port = "PORT",
  RateLimit = "SIGINT_RATE_LIMIT_PER_MINUTE",
  ServerSecret = "SIGINT_SERVER_SECRET",
  TrustedProxyHops = "SIGINT_TRUSTED_PROXY_HOPS",
}

export enum ConfigErrorKind {
  IntegerRequired = "integerRequired",
  MinimumLength = "minimumLength",
  NonNegativeRequired = "nonNegativeRequired",
  OutOfRange = "outOfRange",
  Required = "required",
}

type ConfigErrorDetails =
  | Readonly<{
      kind: ConfigErrorKind.IntegerRequired;
      field: ConfigField;
    }>
  | Readonly<{
      kind: ConfigErrorKind.MinimumLength;
      field: ConfigField;
      minimum: number;
    }>
  | Readonly<{
      kind: ConfigErrorKind.NonNegativeRequired;
      field: ConfigField;
    }>
  | Readonly<{
      kind: ConfigErrorKind.OutOfRange;
      field: ConfigField;
      minimum: number;
      maximum: number;
    }>
  | Readonly<{
      kind: ConfigErrorKind.Required;
      field: ConfigField;
    }>;

function configErrorMessage(details: ConfigErrorDetails): string {
  switch (details.kind) {
    case ConfigErrorKind.IntegerRequired:
      return `${details.field} must be an integer`;
    case ConfigErrorKind.MinimumLength:
      return `${details.field} must be at least ${details.minimum} characters`;
    case ConfigErrorKind.NonNegativeRequired:
      return `${details.field} must be non-negative`;
    case ConfigErrorKind.OutOfRange:
      return `${details.field} must be between ${details.minimum} and ${details.maximum}`;
    case ConfigErrorKind.Required:
      return `${details.field} is required`;
  }
}

export class ConfigError extends Error {
  readonly details: ConfigErrorDetails;

  constructor(details: ConfigErrorDetails) {
    super(configErrorMessage(details));
    this.name = "ConfigError";
    this.details = details;
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
  field: ConfigField,
  min: number,
  max: number,
): number {
  if (!INT_RE.test(value)) {
    throw new ConfigError({
      kind: ConfigErrorKind.IntegerRequired,
      field,
    });
  }
  const n = Number.parseInt(value, 10);
  if (n < min || n > max) {
    throw new ConfigError({
      kind: ConfigErrorKind.OutOfRange,
      field,
      minimum: min,
      maximum: max,
    });
  }
  return n;
}

function parseNonNegativeInt(value: string, field: ConfigField): number {
  if (!INT_RE.test(value)) {
    throw new ConfigError({
      kind: ConfigErrorKind.IntegerRequired,
      field,
    });
  }
  const n = Number.parseInt(value, 10);
  if (n < 0) {
    throw new ConfigError({
      kind: ConfigErrorKind.NonNegativeRequired,
      field,
    });
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
    throw new ConfigError({
      kind: ConfigErrorKind.Required,
      field: ConfigField.ServerSecret,
    });
  }
  if (serverSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError({
      kind: ConfigErrorKind.MinimumLength,
      field: ConfigField.ServerSecret,
      minimum: MIN_SECRET_LENGTH,
    });
  }

  const isProduction = env.NODE_ENV === "production";

  const port = env.PORT
    ? parsePositiveInt(env.PORT, ConfigField.Port, MIN_PORT, MAX_PORT)
    : DEFAULT_PORT;

  const rateLimitPerMinute = env.SIGINT_RATE_LIMIT_PER_MINUTE
    ? parsePositiveInt(
        env.SIGINT_RATE_LIMIT_PER_MINUTE,
        ConfigField.RateLimit,
        1,
        Number.MAX_SAFE_INTEGER,
      )
    : DEFAULT_RATE_LIMIT;

  const trustedProxyHops = env.SIGINT_TRUSTED_PROXY_HOPS
    ? parseNonNegativeInt(
        env.SIGINT_TRUSTED_PROXY_HOPS,
        ConfigField.TrustedProxyHops,
      )
    : DEFAULT_TRUSTED_PROXY_HOPS;

  return Object.freeze({
    serverSecret,
    isProduction,
    port,
    rateLimitPerMinute,
    trustedProxyHops,
    aisstreamApiKey: readOptional(env, "AISSTREAM_API_KEY"),
    domain: readOptional(env, "DOMAIN"),
    fixtureOverridesEnabled: !isProduction,
  });
}
