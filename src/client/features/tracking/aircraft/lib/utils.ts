import type { AircraftData, AircraftFilter, SquawkStatus } from "../types";
import type { BasePoint } from "@/features/base/types";

/**
 * Normalize an ICAO24 hex address: trim, lowercase, strip quotes,
 * validate hex characters, zero-pad to 6 chars.
 */
export function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

export function getSquawkStatus(squawk?: string): SquawkStatus {
  switch (squawk) {
    case "7700":
      return "emergency";
    case "7600":
      return "radio_failure";
    case "7500":
      return "hijack";
    default:
      return "normal";
  }
}

export function getSquawkStatusLabel(status: SquawkStatus): string {
  switch (status) {
    case "emergency":
      return "EMERGENCY";
    case "radio_failure":
      return "RADIO FAILURE";
    case "hijack":
      return "HIJACK";
    default:
      return "NORMAL";
  }
}

export function matchesAircraftFilter(
  item: BasePoint,
  f: AircraftFilter,
): boolean {
  if (!f.enabled) return false;
  const d = (item as unknown as { data: AircraftData }).data;
  const onGround: boolean = d?.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  if (f.milFilter === "military" && !d?.military) return false;
  if (f.milFilter === "civilian" && d?.military) return false;
  if (f.squawks.size > 0) {
    const sq: string = d?.squawk ?? "";
    const bucket =
      sq === "7700"
        ? "7700"
        : sq === "7600"
          ? "7600"
          : sq === "7500"
            ? "7500"
            : "other";
    if (!f.squawks.has(bucket as "7700" | "7600" | "7500" | "other"))
      return false;
  }
  if (f.countries.size > 0) {
    if (!f.countries.has(d?.originCountry ?? "")) return false;
  }
  return true;
}
