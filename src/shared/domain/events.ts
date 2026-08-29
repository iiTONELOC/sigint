import { IntelSeverity, parseIntelSeverity } from "./correlation";
import { isRecord } from "../geo";
import { hasOptionalFields } from "../types/fields";

export enum EventEndpoint {
  Latest = "/api/events/latest",
}

export enum EventApiMessage {
  Unavailable = "Events data is temporarily unavailable.",
}

export enum EventRequiredStringField {
  Headline = "headline",
  Category = "category",
  SourceCountry = "sourceCountry",
  Url = "url",
  LocationName = "locationName",
}

export enum EventOptionalStringField {
  Source = "source",
  Actor1 = "actor1",
  Actor2 = "actor2",
}

export enum EventNumberField {
  Tone = "tone",
  Severity = "severity",
  Goldstein = "goldstein",
  Mentions = "mentions",
}

type EventStringField =
  | EventRequiredStringField
  | EventOptionalStringField;

const REQUIRED_EVENT_STRING_FIELDS: readonly EventRequiredStringField[] =
  Object.values(EventRequiredStringField);
const OPTIONAL_EVENT_STRING_FIELDS: readonly EventOptionalStringField[] =
  Object.values(EventOptionalStringField);
export const EVENT_STRING_FIELDS: readonly EventStringField[] = [
  ...REQUIRED_EVENT_STRING_FIELDS,
  ...OPTIONAL_EVENT_STRING_FIELDS,
];
export const EVENT_NUMBER_FIELDS: readonly EventNumberField[] =
  Object.values(EventNumberField);

type EventNumberData = Omit<
  Record<EventNumberField, number>,
  EventNumberField.Severity
> & {
  [EventNumberField.Severity]: IntelSeverity;
};

export type EventLiveData = Readonly<
  Record<EventRequiredStringField, string> &
    Partial<Record<EventOptionalStringField, string>> &
    EventNumberData
>;

export type EventData = Partial<EventLiveData>;

export type GdeltEvent = Readonly<{
  lat: number;
  lon: number;
  timestamp: string;
  data: EventLiveData;
}>;

export type EventsLatestResponse = Readonly<{
  data: readonly GdeltEvent[];
  fetchedAt: number;
}>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntelSeverity(value: unknown): value is IntelSeverity {
  return isFiniteNumber(value) && parseIntelSeverity(value) === value;
}

export function isEventData(value: unknown): value is EventData {
  return (
    isRecord(value) &&
    hasOptionalFields(
      value,
      EVENT_STRING_FIELDS,
      (candidate) => typeof candidate === "string",
    ) &&
    hasOptionalFields(value, EVENT_NUMBER_FIELDS, isFiniteNumber) &&
    (value[EventNumberField.Severity] === undefined ||
      isIntelSeverity(value[EventNumberField.Severity]))
  );
}

function isEventLiveData(value: unknown): value is EventLiveData {
  return (
    isRecord(value) &&
    REQUIRED_EVENT_STRING_FIELDS.every(
      (field) => typeof value[field] === "string",
    ) &&
    OPTIONAL_EVENT_STRING_FIELDS.every(
      (field) =>
        value[field] === undefined || typeof value[field] === "string",
    ) &&
    EVENT_NUMBER_FIELDS.every((field) => isFiniteNumber(value[field])) &&
    isIntelSeverity(value[EventNumberField.Severity])
  );
}

export function isGdeltEvent(value: unknown): value is GdeltEvent {
  return (
    isRecord(value) &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    typeof value.timestamp === "string" &&
    Number.isFinite(Date.parse(value.timestamp)) &&
    isEventLiveData(value.data)
  );
}

function isEventsLatestResponse(
  value: unknown,
): value is EventsLatestResponse {
  return (
    isRecord(value) &&
    isFiniteNumber(value.fetchedAt) &&
    Array.isArray(value.data) &&
    value.data.every(isGdeltEvent)
  );
}

export function parseEventsLatestResponse(
  value: unknown,
): EventsLatestResponse | null {
  return isEventsLatestResponse(value) ? value : null;
}
