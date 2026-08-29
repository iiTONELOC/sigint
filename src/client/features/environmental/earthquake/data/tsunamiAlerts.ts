import { isRecord } from "@shared/geo";
import {
  TsunamiLevel,
  type TsunamiAlert,
} from "@shared/domain/earthquakes";
import { NWS_ALERTS_TRANSPORT } from "@/workers/data/source-model/feeds";

const TSUNAMI_EVENT_PREFIX = "tsunami";

function levelOf(event: string): TsunamiLevel | null {
  const normalizedEvent = event.toLowerCase();
  for (const level of Object.values(TsunamiLevel)) {
    if (normalizedEvent === `${TSUNAMI_EVENT_PREFIX} ${level}`) {
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
  return json.features
    .map(toTsunamiAlert)
    .filter((alert): alert is TsunamiAlert => alert !== null);
}

export async function fetchTsunamiAlerts(): Promise<TsunamiAlert[]> {
  try {
    const response = await fetch(NWS_ALERTS_TRANSPORT.url, {
      headers: NWS_ALERTS_TRANSPORT.headers,
    });
    if (!response.ok) return [];
    return toTsunamiAlerts(await response.json());
  } catch {
    return [];
  }
}
