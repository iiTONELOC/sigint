import {
  geographicToUnitVector,
  type UnitVector,
} from "@/lib/geo/unitSphere";

const STATION_URL = "https://service.earthscope.org/fdsnws/station/1/query";
const AVAILABILITY_URL = "https://service.earthscope.org/fdsnws/availability/1/query?nodata=204";
const TIMESERIES_URL = "https://service.iris.edu/irisws/timeseries/1/query";
const SEARCH_RADII_DEG = [3, 8, 20, 40];
const CHANNEL_QUERY = "BHZ,HHZ,EHZ,SHZ,LHZ";
const WINDOW_SEC = 240;
const PRE_ROLL_SEC = 20;
const MAX_PLOT_POINTS = 600;
const CHANNEL_RANK: Readonly<Record<string, number>> = {
  BHZ: 0,
  HHZ: 1,
  EHZ: 2,
  SHZ: 3,
  LHZ: 4,
};

export type Waveform = {
  station: string;
  network: string;
  channel: string;
  samples: number[];
  rawSamples: number[];
  sampleRate: number;
};

export type WaveformUnavailableReason =
  | "invalid-event-time"
  | "station-service-unavailable"
  | "availability-service-unavailable"
  | "no-active-station"
  | "no-recorded-trace";

export type WaveformResult =
  | { status: "ready"; waveform: Waveform }
  | { status: "unavailable"; reason: WaveformUnavailableReason };

export type WaveformFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type FetchWaveformOptions = Readonly<{
  fetcher?: WaveformFetcher;
  signal?: AbortSignal;
}>;

type Channel = {
  network: string;
  station: string;
  loc: string;
  channel: string;
  lat: number;
  lon: number;
};

type RankedChannel = Channel & {
  distanceSquared: number;
};

type TraceWindow = Readonly<{
  start: string;
  end: string;
}>;

type ChannelSearchResult =
  | { status: "ready"; channels: Channel[] }
  | { status: "failed" };

type AvailabilitySearchResult =
  | { status: "ready"; channelKeys: ReadonlySet<string> }
  | { status: "failed" };

function squaredChordDistance(origin: UnitVector, channel: Channel): number {
  const candidate = geographicToUnitVector(channel.lat, channel.lon);
  return (
    (candidate.x - origin.x) ** 2 +
    (candidate.y - origin.y) ** 2 +
    (candidate.z - origin.z) ** 2
  );
}

function parseChannels(text: string): Channel[] {
  const out: Channel[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("|");
    if (cols.length < 6) continue;
    const lat = Number.parseFloat(cols[4] ?? "");
    const lon = Number.parseFloat(cols[5] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const rawLoc = (cols[2] ?? "").trim();
    out.push({
      network: (cols[0] ?? "").trim(),
      station: (cols[1] ?? "").trim(),
      loc: rawLoc.length > 0 ? rawLoc : "--",
      channel: (cols[3] ?? "").trim(),
      lat,
      lon,
    });
  }
  return out;
}

function serviceTime(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/\.\d+Z$/, "");
}

function traceWindow(originTimeIso: string): TraceWindow | null {
  const originTimestamp = Date.parse(originTimeIso);
  if (!Number.isFinite(originTimestamp)) return null;
  const startTimestamp = originTimestamp - PRE_ROLL_SEC * 1000;
  return {
    start: serviceTime(startTimestamp),
    end: serviceTime(startTimestamp + WINDOW_SEC * 1000),
  };
}

function stationUrl(
  latitude: number,
  longitude: number,
  radius: number,
  window: TraceWindow,
): string {
  const url = new URL(STATION_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("maxradius", String(radius));
  url.searchParams.set("channel", CHANNEL_QUERY);
  url.searchParams.set("starttime", window.start);
  url.searchParams.set("endtime", window.end);
  url.searchParams.set("includerestricted", "false");
  url.searchParams.set("level", "channel");
  url.searchParams.set("format", "text");
  return url.toString();
}

async function nearbyChannels(
  latitude: number,
  longitude: number,
  radius: number,
  window: TraceWindow,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<ChannelSearchResult> {
  try {
    const response = await fetcher(
      stationUrl(latitude, longitude, radius, window),
      { signal },
    );
    if (response.status === 204 || response.status === 404) {
      return { status: "ready", channels: [] };
    }
    if (!response.ok) return { status: "failed" };
    return { status: "ready", channels: parseChannels(await response.text()) };
  } catch {
    return { status: "failed" };
  }
}

function rankChannels(
  latitude: number,
  longitude: number,
  channels: readonly Channel[],
): RankedChannel[] {
  const origin = geographicToUnitVector(latitude, longitude);
  const uniqueChannels = new Map<string, Channel>();
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
        (CHANNEL_RANK[left.channel] ?? Number.MAX_SAFE_INTEGER) -
          (CHANNEL_RANK[right.channel] ?? Number.MAX_SAFE_INTEGER) ||
        left.network.localeCompare(right.network) ||
        left.station.localeCompare(right.station) ||
        left.loc.localeCompare(right.loc),
    );
}

function channelKey(channel: Channel): string {
  return `${channel.network}.${channel.station}.${channel.loc}.${channel.channel}`;
}

function availabilityRequestBody(
  channels: readonly Channel[],
  window: TraceWindow,
): string {
  return [
    "format=text",
    ...channels.map(
      (channel) =>
        `${channel.network} ${channel.station} ${channel.loc} ${channel.channel} ${window.start} ${window.end}`,
    ),
  ].join("\n");
}

function parseAvailableChannelKeys(text: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [network, station, location, channel] = line.trim().split(/\s+/);
    if (!network || !station || !location || !channel) continue;
    keys.add(`${network}.${station}.${location}.${channel}`);
  }
  return keys;
}

async function availableChannelKeys(
  channels: readonly Channel[],
  window: TraceWindow,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<AvailabilitySearchResult> {
  try {
    const response = await fetcher(AVAILABILITY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: availabilityRequestBody(channels, window),
      signal,
    });
    if (response.status === 204) {
      return { status: "ready", channelKeys: new Set<string>() };
    }
    if (!response.ok) return { status: "failed" };
    return {
      status: "ready",
      channelKeys: parseAvailableChannelKeys(await response.text()),
    };
  } catch {
    return { status: "failed" };
  }
}

function parseTimeseries(text: string): { samples: number[]; sampleRate: number } | null {
  const lines = text.split("\n");
  const header = lines.find((l) => l.startsWith("TIMESERIES")) ?? "";
  const rateMatch = /([\d.]+)\s*sps/.exec(header);
  const sampleRate = rateMatch ? Number.parseFloat(rateMatch[1] ?? "0") : 0;
  const values: number[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("TIMESERIES")) continue;
    const parts = line.trim().split(/\s+/);
    const v = Number.parseFloat(parts.at(-1) ?? "");
    if (Number.isFinite(v)) values.push(v);
  }
  if (values.length < 2 || sampleRate <= 0) return null;
  return { samples: values, sampleRate };
}

function downsample(samples: number[]): number[] {
  if (samples.length <= MAX_PLOT_POINTS) return samples;
  const step = samples.length / MAX_PLOT_POINTS;
  const out: number[] = [];
  for (let i = 0; i < MAX_PLOT_POINTS; i++) {
    const v = samples[Math.floor(i * step)];
    if (v != null) out.push(v);
  }
  return out;
}

async function tryTrace(
  channel: Channel,
  start: string,
  fetcher: WaveformFetcher,
  signal: AbortSignal | undefined,
): Promise<Waveform | null> {
  const url = new URL(TIMESERIES_URL);
  url.searchParams.set("net", channel.network);
  url.searchParams.set("sta", channel.station);
  url.searchParams.set("loc", channel.loc);
  url.searchParams.set("cha", channel.channel);
  url.searchParams.set("starttime", start);
  url.searchParams.set("duration", String(WINDOW_SEC));
  url.searchParams.set("output", "ascii2");
  try {
    const res = await fetcher(url.toString(), { signal });
    if (!res.ok) return null;
    const parsed = parseTimeseries(await res.text());
    if (!parsed) return null;
    return {
      station: channel.station,
      network: channel.network,
      channel: channel.channel,
      samples: downsample(parsed.samples),
      rawSamples: parsed.samples,
      sampleRate: parsed.sampleRate,
    };
  } catch {
    return null;
  }
}

export async function fetchWaveform(
  lat: number,
  lon: number,
  originTimeIso: string,
  options: FetchWaveformOptions = {},
): Promise<WaveformResult> {
  const window = traceWindow(originTimeIso);
  if (!window) {
    return { status: "unavailable", reason: "invalid-event-time" };
  }
  const fetcher: WaveformFetcher =
    options.fetcher ?? ((url, init) => globalThis.fetch(url, init));
  const attemptedChannels = new Set<string>();
  let stationServiceResponded = false;
  let activeStationFound = false;
  let availabilityRequested = false;
  let availabilityServiceResponded = false;

  for (const radius of SEARCH_RADII_DEG) {
    const result = await nearbyChannels(
      lat,
      lon,
      radius,
      window,
      fetcher,
      options.signal,
    );
    if (result.status === "failed") continue;
    stationServiceResponded = true;
    const channels = rankChannels(lat, lon, result.channels);
    if (channels.length > 0) activeStationFound = true;
    if (channels.length === 0) continue;
    availabilityRequested = true;
    const availability = await availableChannelKeys(
      channels,
      window,
      fetcher,
      options.signal,
    );
    if (availability.status === "failed") continue;
    availabilityServiceResponded = true;
    for (const channel of channels.filter((candidate) =>
      availability.channelKeys.has(channelKey(candidate)),
    )) {
      const key = channelKey(channel);
      if (attemptedChannels.has(key)) continue;
      attemptedChannels.add(key);
      const waveform = await tryTrace(
        channel,
        window.start,
        fetcher,
        options.signal,
      );
      if (waveform) return { status: "ready", waveform };
    }
  }
  if (!stationServiceResponded) {
    return { status: "unavailable", reason: "station-service-unavailable" };
  }
  if (!activeStationFound) {
    return { status: "unavailable", reason: "no-active-station" };
  }
  if (availabilityRequested && !availabilityServiceResponded) {
    return {
      status: "unavailable",
      reason: "availability-service-unavailable",
    };
  }
  return { status: "unavailable", reason: "no-recorded-trace" };
}
