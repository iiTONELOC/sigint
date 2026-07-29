import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
} from "@shared/time";
import { EMPTY_TEXT, isText } from "@shared/text";

export enum AgeStyle {
  Compact = "compact",
  Verbose = "verbose",
}

enum FreshAge {
  Compact = "LIVE",
  Verbose = "just now",
}

const LOCALE = "en-US";

/** A unix millisecond count, an ISO string, or nothing. */
export type TimeInput = number | string | null | undefined;

function freshAge(variant: AgeStyle): string {
  return variant === AgeStyle.Compact ? FreshAge.Compact : FreshAge.Verbose;
}

/**
 * Relative age of a unix timestamp or an ISO string.
 * Compact reads "LIVE", "5m", "2h", "3d". Verbose reads "just now",
 * "5m ago", "2h 15m ago", "3d 4h ago".
 */
export function relativeAge(
  input: TimeInput,
  variant: AgeStyle = AgeStyle.Compact,
): string {
  if (input == null) return freshAge(variant);

  const ts = typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(ts)) return freshAge(variant);

  const diff = Date.now() - ts;
  if (diff < MS_PER_MINUTE) return freshAge(variant);

  const mins = Math.floor(diff / MS_PER_MINUTE);
  if (mins < MINUTES_PER_HOUR) {
    return variant === AgeStyle.Compact ? `${mins}m` : `${mins}m ago`;
  }

  const hrs = Math.floor(mins / MINUTES_PER_HOUR);
  if (hrs < HOURS_PER_DAY) {
    return variant === AgeStyle.Compact
      ? `${hrs}h`
      : `${hrs}h ${mins % MINUTES_PER_HOUR}m ago`;
  }

  const days = Math.floor(hrs / HOURS_PER_DAY);
  return variant === AgeStyle.Compact
    ? `${days}d`
    : `${days}d ${hrs % HOURS_PER_DAY}h ago`;
}

/** Absolute local timestamp: "Jun 17, 14:30" (24h). */
const BASE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const ZONED_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  ...BASE_TIME_FORMAT,
  timeZoneName: "short",
};

function localTime(
  input: TimeInput,
  format: Intl.DateTimeFormatOptions,
): string {
  if (input == null || input === EMPTY_TEXT) return EMPTY_TEXT;
  try {
    return new Date(input).toLocaleString(LOCALE, format);
  } catch {
    return isText(input) ? input : EMPTY_TEXT;
  }
}

/** Absolute local timestamp, 24h, no zone: "Jun 17, 14:30". */
export function formatTimestamp(input?: TimeInput): string {
  return localTime(input, BASE_TIME_FORMAT);
}

/** Absolute local timestamp with short zone suffix: "Jun 17, 14:30 CDT". */
export function formatTime(iso?: string): string {
  return localTime(iso, ZONED_TIME_FORMAT);
}

/** An absolute time with its age beside it: "Jun 17, 14:30 CDT (2h 15m ago)". */
export function formatTimeWithAge(input?: TimeInput): string {
  const absolute = formatTime(isText(input) ? input : undefined);
  if (!absolute) return EMPTY_TEXT;
  return `${absolute} (${relativeAge(input, AgeStyle.Verbose)})`;
}

/** The zoneless form of formatTimeWithAge: "Jun 17, 14:30 (2h 15m ago)". */
export function formatTimestampWithAge(input?: TimeInput): string {
  const absolute = formatTimestamp(input);
  if (!absolute) return EMPTY_TEXT;
  return `${absolute} (${relativeAge(input, AgeStyle.Verbose)})`;
}
