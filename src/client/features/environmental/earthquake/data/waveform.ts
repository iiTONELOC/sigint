import {
  geographicToUnitVector,
  type UnitVector,
} from "@/lib/geo/unitSphere";
import { isEnumValue, isNumberEnumValue } from "@shared/types/enum";
import { MS_PER_SECOND } from "@shared/time";
import {
  WaveformChannel,
  WaveformStatus,
  WaveformUnavailableReason,
  type Waveform,
  type WaveformResult,
} from "../model";

export type WaveformFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type FetchWaveformOptions = Readonly<{
  fetcher?: WaveformFetcher;
  signal?: AbortSignal;
}>;

enum WaveformEndpoint {
  Station = "https://service.earthscope.org/fdsnws/station/1/query",
  Timeseries = "https://service.earthscope.org/irisws/timeseries/1/query",
}

enum WaveformSearchRadius {
  Local = 3,
  Regional = 8,
  Wide = 20,
  GlobalFallback = 40,
}

enum WaveformPolicy {
  MaximumPlotPoints = 600,
  MinimumColumnCount = 6,
  MinimumSampleCount = 2,
  PreRollSeconds = 20,
  WindowSeconds = 240,
}

enum StationColumn {
  Channel = 3,
  Latitude = 4,
  Location = 2,
  Longitude = 5,
  Network = 0,
  Station = 1,
}

enum WaveformServiceToken {
  AsciiTwoColumn = "ascii2",
  Channel = "channel",
  ChannelShort = "cha",
  Comma = ",",
  Duration = "duration",
  EndTime = "endtime",
  EmptyLocation = "--",
  False = "false",
  Format = "format",
  HeaderPrefix = "#",
  IncludeRestricted = "includerestricted",
  Latitude = "latitude",
  Level = "level",
  Location = "loc",
  Longitude = "longitude",
  MaximumRadius = "maxradius",
  Network = "net",
  Newline = "\n",
  Pipe = "|",
  SamplesPerSecond = "sps",
  StartTime = "starttime",
  Station = "sta",
  Text = "text",
  TimeseriesHeader = "TIMESERIES",
}

type StationChannel = Readonly<{
  channel: WaveformChannel;
  latitude: number;
  location: string;
  longitude: number;
  network: string;
  station: string;
}>;

type RankedChannel = StationChannel &
  Readonly<{ distanceSquared: number }>;

type TraceWindow = Readonly<{
  end: string;
  start: string;
}>;

type ChannelSearchResult =
  | Readonly<{
      channels: readonly StationChannel[];
      status: WaveformStatus.Ready;
    }>
  | Readonly<{ status: WaveformStatus.Failed }>;

type ParsedTimeseries = Readonly<{
  sampleRate: number;
  samples: number[];
}>;

function squaredChordDistance(
  origin: UnitVector,
  channel: StationChannel,
): number {
  const candidate = geographicToUnitVector(
    channel.latitude,
    channel.longitude,
  );
  return (
    (candidate.x - origin.x) ** 2 +
    (candidate.y - origin.y) ** 2 +
    (candidate.z - origin.z) ** 2
  );
}

function parseChannels(text: string): StationChannel[] {
  const channels: StationChannel[] = [];
  for (const line of text.split(WaveformServiceToken.Newline)) {
    if (!line || line.startsWith(WaveformServiceToken.HeaderPrefix)) continue;
    const columns = line.split(WaveformServiceToken.Pipe);
    if (columns.length < WaveformPolicy.MinimumColumnCount) continue;
    const latitude = Number.parseFloat(
      columns[StationColumn.Latitude] ?? "",
    );
    const longitude = Number.parseFloat(
      columns[StationColumn.Longitude] ?? "",
    );
    const channel = columns[StationColumn.Channel]?.trim();
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !isEnumValue(channel, WaveformChannel)
    ) {
      continue;
    }
    const location = columns[StationColumn.Location]?.trim();
    channels.push({
      channel,
      latitude,
      location: location || WaveformServiceToken.EmptyLocation,
      longitude,
      network: columns[StationColumn.Network]?.trim() ?? "",
      station: columns[StationColumn.Station]?.trim() ?? "",
    });
  }
  return channels;
}

function serviceTime(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/\.\d+Z$/, "");
}

function traceWindow(originTimeIso: string): TraceWindow | null {
  const originTimestamp = Date.parse(originTimeIso);
  if (!Number.isFinite(originTimestamp)) return null;
  const startTimestamp =
    originTimestamp - WaveformPolicy.PreRollSeconds * MS_PER_SECOND;
  return {
    end: serviceTime(
      startTimestamp + WaveformPolicy.WindowSeconds * MS_PER_SECOND,
    ),
    start: serviceTime(startTimestamp),
  };
}

function stationUrl(
  latitude: number,
  longitude: number,
  radius: WaveformSearchRadius,
  window: TraceWindow,
): string {
  const url = new URL(WaveformEndpoint.Station);
  url.searchParams.set(WaveformServiceToken.Latitude, String(latitude));
  url.searchParams.set(WaveformServiceToken.Longitude, String(longitude));
  url.searchParams.set(WaveformServiceToken.MaximumRadius, String(radius));
  url.searchParams.set(
    WaveformServiceToken.Channel,
    Object.values(WaveformChannel).join(WaveformServiceToken.Comma),
  );
  url.searchParams.set(WaveformServiceToken.StartTime, window.start);
  url.searchParams.set(WaveformServiceToken.EndTime, window.end);
  url.searchParams.set(
    WaveformServiceToken.IncludeRestricted,
    WaveformServiceToken.False,
  );
  url.searchParams.set(
    WaveformServiceToken.Level,
    WaveformServiceToken.Channel,
  );
  url.searchParams.set(
    WaveformServiceToken.Format,
    WaveformServiceToken.Text,
  );
  return url.toString();
}

async function nearbyChannels(
  latitude: number,
  longitude: number,
  radius: WaveformSearchRadius,
  window: TraceWindow,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<ChannelSearchResult> {
  try {
    const response = await fetcher(
      stationUrl(latitude, longitude, radius, window),
      { signal },
    );
    if (!response.ok) return { status: WaveformStatus.Failed };
    return {
      channels: parseChannels(await response.text()),
      status: WaveformStatus.Ready,
    };
  } catch {
    return { status: WaveformStatus.Failed };
  }
}

function channelKey(channel: StationChannel): string {
  return [
    channel.network,
    channel.station,
    channel.location,
    channel.channel,
  ].join(".");
}

function channelRank(channel: WaveformChannel): number {
  return Object.values(WaveformChannel).indexOf(channel);
}

function rankChannels(
  latitude: number,
  longitude: number,
  channels: readonly StationChannel[],
): RankedChannel[] {
  const origin = geographicToUnitVector(latitude, longitude);
  const uniqueChannels = new Map<string, StationChannel>();
  for (const channel of channels) {
    uniqueChannels.set(channelKey(channel), channel);
  }
  return [...uniqueChannels.values()]
    .map((channel) => ({
      ...channel,
      distanceSquared: squaredChordDistance(origin, channel),
    }))
    .sort(
      (left, right) =>
        left.distanceSquared - right.distanceSquared ||
        channelRank(left.channel) - channelRank(right.channel) ||
        left.network.localeCompare(right.network) ||
        left.station.localeCompare(right.station) ||
        left.location.localeCompare(right.location),
    );
}

function parseTimeseries(text: string): ParsedTimeseries | null {
  const lines = text.split(WaveformServiceToken.Newline);
  const header =
    lines.find((line) =>
      line.startsWith(WaveformServiceToken.TimeseriesHeader),
    ) ?? "";
  const sampleRate = parseSampleRate(header);
  const samples: number[] = [];
  for (const line of lines) {
    if (
      !line ||
      line.startsWith(WaveformServiceToken.TimeseriesHeader)
    ) {
      continue;
    }
    const value = Number.parseFloat(line.trim().split(/\s+/).at(-1) ?? "");
    if (Number.isFinite(value)) samples.push(value);
  }
  if (
    samples.length < WaveformPolicy.MinimumSampleCount ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0
  ) {
    return null;
  }
  return { sampleRate, samples };
}

function parseSampleRate(header: string): number {
  for (const segment of header.split(WaveformServiceToken.Comma)) {
    const fields = segment.trim().split(/\s+/);
    if (fields.at(-1) === WaveformServiceToken.SamplesPerSecond) {
      return Number.parseFloat(fields.at(-2) ?? "");
    }
  }
  return Number.NaN;
}

function downsample(samples: number[]): number[] {
  if (samples.length <= WaveformPolicy.MaximumPlotPoints) return samples;
  const step = samples.length / WaveformPolicy.MaximumPlotPoints;
  const points: number[] = [];
  for (let index = 0; index < WaveformPolicy.MaximumPlotPoints; index++) {
    const value = samples[Math.floor(index * step)];
    if (value != null) points.push(value);
  }
  return points;
}

async function tryTrace(
  channel: StationChannel,
  start: string,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<Waveform | null> {
  const url = new URL(WaveformEndpoint.Timeseries);
  url.searchParams.set(WaveformServiceToken.Network, channel.network);
  url.searchParams.set(WaveformServiceToken.Station, channel.station);
  url.searchParams.set(WaveformServiceToken.Location, channel.location);
  url.searchParams.set(WaveformServiceToken.ChannelShort, channel.channel);
  url.searchParams.set(WaveformServiceToken.StartTime, start);
  url.searchParams.set(
    WaveformServiceToken.Duration,
    String(WaveformPolicy.WindowSeconds),
  );
  url.searchParams.set(
    WaveformServiceToken.Format,
    WaveformServiceToken.AsciiTwoColumn,
  );
  try {
    const response = await fetcher(url.toString(), { signal });
    if (!response.ok) return null;
    const parsed = parseTimeseries(await response.text());
    if (!parsed) return null;
    return {
      channel: channel.channel,
      network: channel.network,
      rawSamples: parsed.samples,
      sampleRate: parsed.sampleRate,
      samples: downsample(parsed.samples),
      station: channel.station,
    };
  } catch {
    return null;
  }
}

function searchRadii(): WaveformSearchRadius[] {
  return Object.values(WaveformSearchRadius).filter(
    (value): value is WaveformSearchRadius =>
      isNumberEnumValue(value, WaveformSearchRadius),
  );
}

async function firstRecordedTrace(
  channels: readonly RankedChannel[],
  window: TraceWindow,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
  attemptedChannels: Set<string>,
): Promise<Waveform | null> {
  for (const channel of channels) {
    const key = channelKey(channel);
    if (attemptedChannels.has(key)) continue;
    attemptedChannels.add(key);
    const waveform = await tryTrace(
      channel,
      window.start,
      fetcher,
      signal,
    );
    if (waveform) return waveform;
  }
  return null;
}

export async function fetchWaveform(
  latitude: number,
  longitude: number,
  originTimeIso: string,
  options: FetchWaveformOptions = {},
): Promise<WaveformResult> {
  const window = traceWindow(originTimeIso);
  if (!window) {
    return {
      reason: WaveformUnavailableReason.EventTime,
      status: WaveformStatus.Unavailable,
    };
  }
  const fetcher: WaveformFetcher =
    options.fetcher ?? ((url, init) => globalThis.fetch(url, init));
  const attemptedChannels = new Set<string>();
  let stationServiceResponded = false;
  let stationFound = false;

  for (const radius of searchRadii()) {
    const result = await nearbyChannels(
      latitude,
      longitude,
      radius,
      window,
      fetcher,
      options.signal,
    );
    if (result.status === WaveformStatus.Failed) continue;
    stationServiceResponded = true;
    const channels = rankChannels(latitude, longitude, result.channels);
    if (channels.length > 0) stationFound = true;
    const waveform = await firstRecordedTrace(
      channels,
      window,
      fetcher,
      options.signal,
      attemptedChannels,
    );
    if (waveform) {
      return { status: WaveformStatus.Ready, waveform };
    }
  }
  if (!stationServiceResponded) {
    return {
      reason: WaveformUnavailableReason.StationService,
      status: WaveformStatus.Unavailable,
    };
  }
  return {
    reason: stationFound
      ? WaveformUnavailableReason.RecordedTrace
      : WaveformUnavailableReason.Station,
    status: WaveformStatus.Unavailable,
  };
}
