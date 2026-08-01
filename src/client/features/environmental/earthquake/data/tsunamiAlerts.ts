import { isRecord } from "@shared/geo";

export enum TsunamiLevel {
  Warning = "warning",
  Watch = "watch",
  Advisory = "advisory",
}

enum TsunamiEndpoint {
  ActiveAlerts = "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
}

enum TsunamiEventPrefix {
  Tsunami = "tsunami",
}

export type TsunamiAlert = {
  id: string;
  level: TsunamiLevel;
  event: string;
  areaDesc: string;
  headline: string;
  expires: string;
};

function levelOf(event: string): TsunamiLevel | null {
  const normalizedEvent = event.toLowerCase();
  for (const level of Object.values(TsunamiLevel)) {
    if (normalizedEvent === `${TsunamiEventPrefix.Tsunami} ${level}`) {
      return level;
    }
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toTsunamiAlert(value: unknown): TsunamiAlert | null {
  if (!isRecord(value)) return null;
  const properties = isRecord(value.properties)
    ? value.properties
    : {};
  const event = textValue(properties.event);
  const level = levelOf(event);
  if (level === null) return null;
  return {
    id: textValue(value.id) || event,
    level,
    event,
    areaDesc: textValue(properties.areaDesc),
    headline: textValue(properties.headline),
    expires: textValue(properties.expires),
  };
}

function toTsunamiAlerts(json: unknown): TsunamiAlert[] {
  if (!isRecord(json) || !Array.isArray(json.features)) return [];

  const out: TsunamiAlert[] = [];
  for (const feature of json.features) {
    const alert = toTsunamiAlert(feature);
    if (alert) out.push(alert);
  }
  return out;
}

export async function fetchTsunamiAlerts(): Promise<TsunamiAlert[]> {
  try {
    const res = await fetch(TsunamiEndpoint.ActiveAlerts, {
      headers: {
        "User-Agent": "(sigint-dashboard, osint-tool)",
        Accept: "application/geo+json",
      },
    });
    if (!res.ok) return [];
    return toTsunamiAlerts(await res.json());
  } catch {
    return [];
  }
}
