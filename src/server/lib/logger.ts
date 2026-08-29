export const REDACTED = "[REDACTED]";

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export type LogSink = {
  write(chunk: Uint8Array): Promise<void> | void;
};

export type LoggerOptions = Readonly<{
  service: string;
  level?: LogLevel;
  sink?: LogSink;
}>;

export type Logger = Readonly<{
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
};

const REDACT_KEYS: ReadonlySet<string> = new Set([
  "token",
  "tokens",
  "refreshtoken",
  "accesstoken",
  "idtoken",
  "password",
  "passwd",
  "pwd",
  "apikey",
  "api_key",
  "secret",
  "secrets",
  "authorization",
  "auth",
  "cookie",
  "cookies",
  "setcookie",
  "set-cookie",
  "sigint_token",
  "privatekey",
  "private_key",
  "key",
]);

const COOKIE_SCRUB = /sigint_token=[^;\s]+/gi;

function shouldEmit(min: LogLevel, level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
}

function scrubMessage(message: string): string {
  return message.replace(COOKIE_SCRUB, REDACTED);
}

function redactFields(
  fields: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
      continue;
    }
    if (
      depth < 1 &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = redactFields(value as Record<string, unknown>, depth + 1);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function extractError(fields: Record<string, unknown>): {
  remaining: Record<string, unknown>;
  errorClass?: string;
  errorMessage?: string;
} {
  if (!("error" in fields)) return { remaining: fields };
  const { error, ...rest } = fields;
  if (error instanceof Error) {
    return {
      remaining: rest,
      errorClass: error.constructor.name,
      errorMessage: error.message,
    };
  }
  return { remaining: rest };
}

const defaultSink: LogSink = {
  async write(chunk: Uint8Array): Promise<void> {
    try {
      await Bun.write(Bun.stderr, chunk);
    } catch {
      // best-effort
    }
  },
};

export function createLogger(options: LoggerOptions): Logger {
  const { service } = options;
  const minLevel: LogLevel = options.level ?? LogLevel.Info;
  const sink: LogSink = options.sink ?? defaultSink;

  function emit(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> | undefined,
  ): void {
    if (!shouldEmit(minLevel, level)) return;

    // Extract errors before recursive redaction removes the class name.
    const { remaining, errorClass, errorMessage } = fields
      ? extractError(fields)
      : { remaining: {} };
    const safeFields = redactFields(remaining);

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message: scrubMessage(message),
      ...safeFields,
    };
    if (errorClass) entry.errorClass = errorClass;
    if (errorMessage) entry.errorMessage = errorMessage;

    const line = JSON.stringify(entry) + "\n";
    const bytes = new TextEncoder().encode(line);

    try {
      const result = sink.write(bytes);
      if (result instanceof Promise) {
        result.catch(() => {
          // best-effort
        });
      }
    } catch {
      // best-effort
    }
  }

  return {
    debug(message, fields) {
      emit(LogLevel.Debug, message, fields);
    },
    info(message, fields) {
      emit(LogLevel.Info, message, fields);
    },
    warn(message, fields) {
      emit(LogLevel.Warn, message, fields);
    },
    error(message, fields) {
      emit(LogLevel.Error, message, fields);
    },
  };
}
