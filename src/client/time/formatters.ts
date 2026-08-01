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

enum TimeLocale {
  EnglishUnitedStates = "en-US",
}

const FRESH_AGE: Readonly<Record<AgeStyle, string>> = {
  [AgeStyle.Compact]: "LIVE",
  [AgeStyle.Verbose]: "just now",
};

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

/** A Unix millisecond count, an ISO string, or no time. */
export type TimeInput = number | string | null | undefined;

function freshAge(style: AgeStyle): string {
  return FRESH_AGE[style];
}

/** Return the relative age of a Unix timestamp or an ISO string. */
export function relativeAge(
  input: TimeInput,
  style: AgeStyle = AgeStyle.Compact,
): string {
  if (input == null) return freshAge(style);

  const timestamp =
    typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(timestamp)) return freshAge(style);

  const difference = Date.now() - timestamp;
  if (difference < MS_PER_MINUTE) return freshAge(style);

  const minutes = Math.floor(difference / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return style === AgeStyle.Compact
      ? `${minutes}m`
      : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return style === AgeStyle.Compact
      ? `${hours}h`
      : `${hours}h ${minutes % MINUTES_PER_HOUR}m ago`;
  }

  const days = Math.floor(hours / HOURS_PER_DAY);
  return style === AgeStyle.Compact
    ? `${days}d`
    : `${days}d ${hours % HOURS_PER_DAY}h ago`;
}

function localTime(
  input: TimeInput,
  format: Intl.DateTimeFormatOptions,
): string {
  if (input == null || input === EMPTY_TEXT) return EMPTY_TEXT;
  try {
    return new Date(input).toLocaleString(
      TimeLocale.EnglishUnitedStates,
      format,
    );
  } catch {
    return isText(input) ? input : EMPTY_TEXT;
  }
}

/** Return an absolute local timestamp without a time-zone suffix. */
export function formatTimestamp(input?: TimeInput): string {
  return localTime(input, BASE_TIME_FORMAT);
}

/** Return an absolute local timestamp with a short time-zone suffix. */
export function formatTime(iso?: string): string {
  return localTime(iso, ZONED_TIME_FORMAT);
}

/** Return an absolute zoned time with its relative age. */
export function formatTimeWithAge(input?: TimeInput): string {
  const absolute = formatTime(isText(input) ? input : undefined);
  if (!absolute) return EMPTY_TEXT;
  return `${absolute} (${relativeAge(input, AgeStyle.Verbose)})`;
}

/** Return an absolute local timestamp with its relative age. */
export function formatTimestampWithAge(input?: TimeInput): string {
  const absolute = formatTimestamp(input);
  if (!absolute) return EMPTY_TEXT;
  return `${absolute} (${relativeAge(input, AgeStyle.Verbose)})`;
}
