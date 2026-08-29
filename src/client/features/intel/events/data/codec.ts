import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  hasPointShape,
  parsePointList,
} from "@/features/base/pointCodec";
import { isEventData } from "@shared/domain/events";

export type EventPoint = Extract<DataPoint, { type: Domain.Events }>;

export function isEventPoint(value: unknown): value is EventPoint {
  return hasPointShape(value, Domain.Events) && isEventData(value.data);
}

export function parseEventCache(
  value: unknown,
): readonly EventPoint[] | null {
  return parsePointList(value, isEventPoint);
}
