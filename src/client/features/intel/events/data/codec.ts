import type { DataPoint } from "@/features/base/dataPoints";
import {
  hasOptionalFields,
  hasPointShape,
  isOptionalNumber,
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import type { EventData } from "@/features/intel/events/types";
import { isRecord } from "@shared/geo";

export type EventPoint = Extract<DataPoint, { type: "events" }>;

const STRING_FIELDS = [
  "headline",
  "snippet",
  "category",
  "source",
  "sourceDomain",
  "sourceCountry",
  "language",
  "url",
  "imageUrl",
  "actor1",
  "actor2",
  "eventCode",
  "locationName",
] as const;

const NUMBER_FIELDS = [
  "tone",
  "severity",
  "goldstein",
  "mentions",
  "locationResolution",
] as const;

function isEventData(value: unknown): value is EventData {
  return (
    isRecord(value) &&
    hasOptionalFields(value, STRING_FIELDS, isOptionalString) &&
    hasOptionalFields(value, NUMBER_FIELDS, isOptionalNumber)
  );
}

export function isEventPoint(value: unknown): value is EventPoint {
  return hasPointShape(value, "events") && isEventData(value.data);
}

export function parseEventCache(
  value: unknown,
): readonly EventPoint[] | null {
  return parsePointList(value, isEventPoint);
}
