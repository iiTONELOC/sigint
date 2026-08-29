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
  waveformUnavailable,
  type Waveform,
  type WaveformResult,
} from "@shared/domain/earthquakes";

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

type ParsedTimeseries = Readonly<{
  sampleRate: number;
  samples: number[];
}>;

type ServiceParameter = readonly [WaveformServiceToken, string];

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
  return serviceUrl(WaveformEndpoint.Station, [
    [WaveformServiceToken.Latitude, String(latitude)],
    [WaveformServiceToken.Longitude, String(longitude)],
    [WaveformServiceToken.MaximumRadius, String(radius)],
    [
      WaveformServiceToken.Channel,
      Object.values(WaveformChannel).join(WaveformServiceToken.Comma),
    ],
    [WaveformServiceToken.StartTime, window.start],
    [WaveformServiceToken.EndTime, window.end],
    [WaveformServiceToken.IncludeRestricted, WaveformServiceToken.False],
    [WaveformServiceToken.Level, WaveformServiceToken.Channel],
    [WaveformServiceToken.Format, WaveformServiceToken.Text],
  ]);
}

function serviceUrl(
  endpoint: WaveformEndpoint,
  parameters: readonly ServiceParameter[],
): string {
  const url = new URL(endpoint);
  for (const [key, value] of parameters) url.searchParams.set(key, value);
  return url.toString();
}

async function nearbyChannels(
  latitude: number,
  longitude: number,
  radius: WaveformSearchRadius,
  window: TraceWindow,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<StationChannel[] | null> {
  try {
    const response = await fetcher(
      stationUrl(latitude, longitude, radius, window),
      { signal },
    );
    return response.ok ? parseChannels(await response.text()) : null;
  } catch {
    return null;
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
  const url = serviceUrl(WaveformEndpoint.Timeseries, [
    [WaveformServiceToken.Network, channel.network],
    [WaveformServiceToken.Station, channel.station],
    [WaveformServiceToken.Location, channel.location],
    [WaveformServiceToken.ChannelShort, channel.channel],
    [WaveformServiceToken.StartTime, start],
    [WaveformServiceToken.Duration, String(WaveformPolicy.WindowSeconds)],
    [WaveformServiceToken.Format, WaveformServiceToken.AsciiTwoColumn],
  ]);
  try {
    const response = await fetcher(url, { signal });
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

export async function fetchWaveform(
  latitude: number,
  longitude: number,
  originTimeIso: string,
  options: FetchWaveformOptions = {},
): Promise<WaveformResult> {
  const window = traceWindow(originTimeIso);
  if (!window) {
    return waveformUnavailable(WaveformUnavailableReason.EventTime);
  }
  const fetcher: WaveformFetcher =
    options.fetcher ?? ((url, init) => globalThis.fetch(url, init));
  const attemptedChannels = new Set<string>();
  let stationServiceResponded = false;
  let stationCount = 0;

  for (const radius of searchRadii()) {
    const nearby = await nearbyChannels(
      latitude,
      longitude,
      radius,
      window,
      fetcher,
      options.signal,
    );
    if (!nearby) continue;
    stationServiceResponded = true;
    const channels = rankChannels(latitude, longitude, nearby);
    stationCount += channels.length;
    for (const channel of channels) {
      const key = channelKey(channel);
      if (attemptedChannels.has(key)) continue;
      attemptedChannels.add(key);
      const waveform = await tryTrace(
        channel,
        window.start,
        fetcher,
        options.signal,
      );
      if (waveform) return { status: WaveformStatus.Ready, waveform };
    }
  }
  if (!stationServiceResponded) {
    return waveformUnavailable(WaveformUnavailableReason.StationService);
  }
  return waveformUnavailable(
    stationCount > 0
      ? WaveformUnavailableReason.RecordedTrace
      : WaveformUnavailableReason.Station,
  );
}
