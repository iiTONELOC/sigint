/**
 * Format a timestamp as a human-readable relative age string.
 * Accepts a unix timestamp (number), an ISO string, or undefined.
 *
 * Variants:
 *  - "compact" (default): "LIVE", "5m", "2h", "3d"
 *  - "verbose": "just now", "5m ago", "2h 15m ago", "3d 4h ago"
 */
export function relativeAge(
  input: number | string | undefined | null,
  variant: "compact" | "verbose" = "compact",
): string {
  if (input == null) return variant === "compact" ? "LIVE" : "just now";

  const ts = typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(ts)) return variant === "compact" ? "LIVE" : "just now";

  const diff = Date.now() - ts;
  if (diff < 0 || diff < 60_000) {
    return variant === "compact" ? "LIVE" : "just now";
  }

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) {
    return variant === "compact" ? `${mins}m` : `${mins}m ago`;
  }

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return variant === "compact" ? `${hrs}h` : `${hrs}h ${mins % 60}m ago`;
  }

  const days = Math.floor(hrs / 24);
  return variant === "compact" ? `${days}d` : `${days}d ${hrs % 24}h ago`;
}

/** Absolute local timestamp: "Jun 17, 14:30 CDT" (24h, short TZ). "" if no
 *  input; the raw string back if it doesn't parse. */
const BASE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** Absolute local timestamp, 24h, no zone: "Jun 17, 14:30". Accepts a unix ms
 *  number or ISO string. "" for no input; raw string back if it doesn't parse. */
export function formatTimestamp(input?: number | string | null): string {
  if (input == null) return "";
  try {
    return new Date(input).toLocaleString("en-US", BASE_TIME_FORMAT);
  } catch {
    return typeof input === "string" ? input : "";
  }
}

/** Absolute local timestamp with short TZ suffix: "Jun 17, 14:30 CDT". */
export function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", { ...BASE_TIME_FORMAT, timeZoneName: "short" });
  } catch {
    return iso;
  }
}
