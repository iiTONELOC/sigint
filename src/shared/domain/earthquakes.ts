import { createGeoPoint, isRecord } from "../geo";
import { optionalString } from "../text";
import { isEnumValue } from "../types/enum";
import { optionalFiniteNumber } from "../types/numbers";

export type EarthquakeData = Readonly<{
  magnitude?: number;
  depth?: number;
  location?: string;
  felt?: number;
  tsunami?: boolean;
  alert?: string;
  significance?: number;
  magType?: string;
  eventType?: string;
  url?: string;
  status?: string;
}>;

export function parseEarthquakeData(
  candidate: unknown,
): EarthquakeData | null {
  if (!isRecord(candidate)) return null;
  return {
    magnitude: optionalFiniteNumber(candidate.magnitude),
    depth: optionalFiniteNumber(candidate.depth),
    location: optionalString(candidate.location),
    felt: optionalFiniteNumber(candidate.felt),
    tsunami:
      typeof candidate.tsunami === "boolean"
        ? candidate.tsunami
        : undefined,
    alert: optionalString(candidate.alert),
    significance: optionalFiniteNumber(candidate.significance),
    magType: optionalString(candidate.magType),
    eventType: optionalString(candidate.eventType),
    url: optionalString(candidate.url),
    status: optionalString(candidate.status),
  };
}

export function earthquakeDataEquals(
  left: EarthquakeData,
  right: EarthquakeData,
): boolean {
  return Object.keys({ ...left, ...right }).every((field) => {
    const key = field as keyof EarthquakeData;
    return left[key] === right[key];
  });
}

export enum WaveformChannel {
  BroadbandHighGainVertical = "BHZ",
  ExtremelyShortPeriodVertical = "EHZ",
  HighBroadbandHighGainVertical = "HHZ",
  LongPeriodHighGainVertical = "LHZ",
  ShortPeriodHighGainVertical = "SHZ",
}

export enum WaveformStatus {
  Loading = "loading",
  Ready = "ready",
  Unavailable = "unavailable",
}

export enum WaveformUnavailableReason {
  EventTime = "invalid-event-time",
  RecordedTrace = "no-recorded-trace",
  Station = "no-active-station",
  StationService = "station-service-unavailable",
}

export type Waveform = Readonly<{
  channel: WaveformChannel;
  network: string;
  rawSamples: number[];
  sampleRate: number;
  samples: number[];
  station: string;
}>;

export type WaveformRequest = Readonly<{
  latitude: number;
  longitude: number;
  originTimeIso: string;
}>;

export type WaveformResult =
  | Readonly<{ status: WaveformStatus.Ready; waveform: Waveform }>
  | Readonly<{
      reason: WaveformUnavailableReason;
      status: WaveformStatus.Unavailable;
    }>;

export type WaveformState =
  | Readonly<{ status: WaveformStatus.Loading }>
  | WaveformResult;

export function waveformUnavailable(reason: WaveformUnavailableReason): WaveformResult {
  return { reason, status: WaveformStatus.Unavailable };
}

function finiteNumbers(value: unknown): number[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (candidate): candidate is number =>
        typeof candidate === "number" && Number.isFinite(candidate),
    )
  ) return null;
  return [...value];
}

export function parseWaveformRequest(
  value: unknown,
): WaveformRequest | null {
  if (!isRecord(value)) return null;
  const { latitude, longitude, originTimeIso } = value;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    typeof originTimeIso !== "string"
  ) return null;
  const point = createGeoPoint(longitude, latitude);
  if (!point) return null;
  return { latitude: point[1], longitude: point[0], originTimeIso };
}

function parseWaveform(value: unknown): Waveform | null {
  if (!isRecord(value)) return null;
  const {
    channel,
    network,
    rawSamples: rawValue,
    sampleRate,
    samples: sampleValue,
    station,
  } = value;
  if (
    !isEnumValue(channel, WaveformChannel) ||
    typeof network !== "string" ||
    typeof sampleRate !== "number" ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    typeof station !== "string"
  ) {
    return null;
  }
  const rawSamples = finiteNumbers(rawValue);
  const samples = finiteNumbers(sampleValue);
  if (!rawSamples || !samples) return null;
  return { channel, network, rawSamples, sampleRate, samples, station };
}

export function parseWaveformResult(
  value: unknown,
): WaveformResult | null {
  if (!isRecord(value) || !isEnumValue(value.status, WaveformStatus)) {
    return null;
  }
  if (value.status === WaveformStatus.Ready) {
    const waveform = parseWaveform(value.waveform);
    return waveform ? { status: WaveformStatus.Ready, waveform } : null;
  }
  if (
    value.status === WaveformStatus.Unavailable &&
    isEnumValue(value.reason, WaveformUnavailableReason)
  ) {
    return waveformUnavailable(value.reason);
  }
  return null;
}

export enum TsunamiLevel {
  Warning = "warning",
  Watch = "watch",
  Advisory = "advisory",
}

export type TsunamiAlert = Readonly<{
  id: string;
  level: TsunamiLevel;
  event: string;
  areaDesc: string;
  headline: string;
  expires: string;
}>;

function parseTsunamiAlert(value: unknown): TsunamiAlert | null {
  if (!isRecord(value)) return null;
  const { id, level, event, areaDesc, headline, expires } = value;
  if (
    typeof id !== "string" ||
    !isEnumValue(level, TsunamiLevel) ||
    typeof event !== "string" ||
    typeof areaDesc !== "string" ||
    typeof headline !== "string" ||
    typeof expires !== "string"
  ) {
    return null;
  }
  return { id, level, event, areaDesc, headline, expires };
}

export function parseTsunamiAlerts(
  value: unknown,
): TsunamiAlert[] | null {
  if (!Array.isArray(value)) return null;
  const alerts = value
    .map(parseTsunamiAlert)
    .filter((alert): alert is TsunamiAlert => alert !== null);
  return alerts.length === value.length ? alerts : null;
}
