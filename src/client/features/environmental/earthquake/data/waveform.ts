const STATION_URL = "https://service.iris.edu/fdsnws/station/1/query";
const TIMESERIES_URL = "https://service.iris.edu/irisws/timeseries/1/query";
const SEARCH_RADII_DEG = [3, 8, 20, 40];
const WINDOW_SEC = 240;
const PRE_ROLL_SEC = 20;
const MAX_PLOT_POINTS = 600;
const MAX_CANDIDATES = 2;
const CHANNEL_RANK: Record<string, number> = { BHZ: 0, HHZ: 1, EHZ: 2, SHZ: 3 };

export type Waveform = {
  station: string;
  network: string;
  channel: string;
  samples: number[];
  rawSamples: number[];
  sampleRate: number;
};

type Channel = {
  network: string;
  station: string;
  loc: string;
  channel: string;
  lat: number;
  lon: number;
};

function haversineDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = bLat - aLat;
  const dLon = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

function parseChannels(text: string): Channel[] {
  const out: Channel[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("|");
    if (cols.length < 6) continue;
    const lat = Number.parseFloat(cols[4] ?? "");
    const lon = Number.parseFloat(cols[5] ?? "");
    const endTime = (cols.at(-1) ?? "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (endTime.length > 0) continue;
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

async function nearbyChannels(lat: number, lon: number): Promise<Channel[]> {
  for (const radius of SEARCH_RADII_DEG) {
    const url = `${STATION_URL}?latitude=${lat}&longitude=${lon}&maxradius=${radius}&channel=BHZ,HHZ,EHZ,SHZ&level=channel&format=text`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const channels = parseChannels(await res.text());
      if (channels.length === 0) continue;
      return channels
        .slice()
        .sort((a, b) => {
          const da = haversineDeg(lat, lon, a.lat, a.lon);
          const db = haversineDeg(lat, lon, b.lat, b.lon);
          if (Math.abs(da - db) > 0.5) return da - db;
          return (CHANNEL_RANK[a.channel] ?? 9) - (CHANNEL_RANK[b.channel] ?? 9);
        })
        .slice(0, MAX_CANDIDATES);
    } catch {
      continue;
    }
  }
  return [];
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
  if (values.length < 2) return null;
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

async function tryTrace(ch: Channel, start: string): Promise<Waveform | null> {
  const url = `${TIMESERIES_URL}?net=${ch.network}&sta=${ch.station}&loc=${ch.loc}&cha=${ch.channel}&starttime=${start}&duration=${WINDOW_SEC}&output=ascii2`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = parseTimeseries(await res.text());
    if (!parsed) return null;
    return {
      station: ch.station,
      network: ch.network,
      channel: ch.channel,
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
): Promise<Waveform | null> {
  const channels = await nearbyChannels(lat, lon);
  if (channels.length === 0) return null;
  const start = new Date(new Date(originTimeIso).getTime() - PRE_ROLL_SEC * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, "");
  for (const ch of channels) {
    const wave = await tryTrace(ch, start);
    if (wave) return wave;
  }
  return null;
}
