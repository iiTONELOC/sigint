import { latitudeOf, longitudeOf, type GeoPoint } from "@shared/geo";

// The transition accessor. A migrated record stores a GeoPoint; one that has
// not migrated still stores loose degrees. Every generic consumer reads
// through here, and this module deletes with the last legacy source.

export type PositionedRecord =
  | Readonly<{ position: GeoPoint }>
  | Readonly<{ lat: number; lon: number }>;

function isMigrated(
  record: PositionedRecord,
): record is Readonly<{ position: GeoPoint }> {
  return "position" in record;
}

export function recordLatitude(record: PositionedRecord): number {
  return isMigrated(record) ? latitudeOf(record.position) : record.lat;
}

export function recordLongitude(record: PositionedRecord): number {
  return isMigrated(record) ? longitudeOf(record.position) : record.lon;
}

export function recordPosition(record: PositionedRecord): GeoPoint {
  return isMigrated(record) ? record.position : [record.lon, record.lat];
}
