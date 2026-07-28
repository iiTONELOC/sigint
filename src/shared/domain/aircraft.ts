export enum SquawkCode {
  Emergency = "7700",
  RadioFailure = "7600",
  Hijack = "7500",
}

export enum SquawkBucket {
  Emergency = "7700",
  RadioFailure = "7600",
  Hijack = "7500",
  Other = "other",
}

export enum SquawkStatus {
  Emergency = "emergency",
  RadioFailure = "radio_failure",
  Hijack = "hijack",
  Normal = "normal",
}

export enum MilFilter {
  All = "all",
  Military = "military",
  Civilian = "civilian",
  Recon = "recon",
}

const SQUAWK_BUCKETS: Readonly<Record<SquawkCode, SquawkBucket>> = {
  [SquawkCode.Emergency]: SquawkBucket.Emergency,
  [SquawkCode.RadioFailure]: SquawkBucket.RadioFailure,
  [SquawkCode.Hijack]: SquawkBucket.Hijack,
};

const SQUAWK_STATUSES: Readonly<Record<SquawkCode, SquawkStatus>> = {
  [SquawkCode.Emergency]: SquawkStatus.Emergency,
  [SquawkCode.RadioFailure]: SquawkStatus.RadioFailure,
  [SquawkCode.Hijack]: SquawkStatus.Hijack,
};

function isSquawkCode(value: string | undefined): value is SquawkCode {
  return value === SquawkCode.Emergency ||
    value === SquawkCode.RadioFailure ||
    value === SquawkCode.Hijack;
}

export function squawkBucketFor(squawk: string | undefined): SquawkBucket {
  return isSquawkCode(squawk) ? SQUAWK_BUCKETS[squawk] : SquawkBucket.Other;
}

export function squawkStatusFor(squawk: string | undefined): SquawkStatus {
  return isSquawkCode(squawk) ? SQUAWK_STATUSES[squawk] : SquawkStatus.Normal;
}
