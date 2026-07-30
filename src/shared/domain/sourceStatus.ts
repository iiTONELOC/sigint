export enum SourceStatus {
  Loading = "loading",
  Live = "live",
  Cached = "cached",
  Error = "error",
  Empty = "empty",
  Unavailable = "unavailable",
}

const SOURCE_STATUS_VALUES: ReadonlySet<string> = new Set(
  Object.values(SourceStatus),
);

export function isSourceStatus(value: unknown): value is SourceStatus {
  return typeof value === "string" && SOURCE_STATUS_VALUES.has(value);
}

export function isSourceDown(
  status: SourceStatus | undefined,
): boolean {
  return status === SourceStatus.Error || status === SourceStatus.Unavailable;
}

export function isSourceDelivering(
  status: SourceStatus | undefined,
): boolean {
  return status === SourceStatus.Live || status === SourceStatus.Cached;
}
