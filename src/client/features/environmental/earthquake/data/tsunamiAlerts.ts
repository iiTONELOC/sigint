import { isRecord } from "@shared/geo";
import {
  TsunamiLevel,
  type TsunamiAlert,
} from "@shared/domain/earthquakes";
import { NWS_ALERTS_TRANSPORT } from "@/workers/data/source-model/feeds";
import {
  SourceFetchError,
  SourceFetchFailure,
  type SourceFailureMessages,
} from "@/workers/data/source-model/remoteSource";

const TSUNAMI_EVENT_PREFIX = "tsunami";

const TSUNAMI_FAILURE_MESSAGES = {
  [SourceFetchFailure.Request]: "The tsunami alert request failed",
  [SourceFetchFailure.Payload]: "The tsunami alert response format is invalid",
} satisfies SourceFailureMessages;

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
  if (!isRecord(json) || !Array.isArray(json.features)) {
    throw new SourceFetchError(SourceFetchFailure.Payload, TSUNAMI_FAILURE_MESSAGES);
  }
  return json.features
    .map(toTsunamiAlert)
    .filter((alert): alert is TsunamiAlert => alert !== null);
}

export async function fetchTsunamiAlerts(): Promise<TsunamiAlert[]> {
  const response = await fetch(NWS_ALERTS_TRANSPORT.url, {
    headers: NWS_ALERTS_TRANSPORT.headers,
  });
  if (!response.ok) {
    throw new SourceFetchError(SourceFetchFailure.Request, TSUNAMI_FAILURE_MESSAGES, response.status);
  }
  return toTsunamiAlerts(await response.json());
}
