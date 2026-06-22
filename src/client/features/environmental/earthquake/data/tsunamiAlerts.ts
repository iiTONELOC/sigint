export type TsunamiLevel = "warning" | "watch" | "advisory";

export type TsunamiAlert = {
  id: string;
  level: TsunamiLevel;
  event: string;
  areaDesc: string;
  headline: string;
  expires: string;
};

const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const TSUNAMI_EVENTS = new Set([
  "tsunami warning",
  "tsunami watch",
  "tsunami advisory",
]);

function levelOf(eventLower: string): TsunamiLevel {
  if (eventLower.includes("warning")) return "warning";
  if (eventLower.includes("advisory")) return "advisory";
  return "watch";
}

function toTsunamiAlerts(json: unknown): TsunamiAlert[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: TsunamiAlert[] = [];
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const feat = f as Record<string, unknown>;
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    const event = typeof props.event === "string" ? props.event : "";
    if (!TSUNAMI_EVENTS.has(event.toLowerCase())) continue;
    out.push({
      id: typeof feat.id === "string" ? feat.id : event,
      level: levelOf(event.toLowerCase()),
      event,
      areaDesc: typeof props.areaDesc === "string" ? props.areaDesc : "",
      headline: typeof props.headline === "string" ? props.headline : "",
      expires: typeof props.expires === "string" ? props.expires : "",
    });
  }
  return out;
}

export async function fetchTsunamiAlerts(): Promise<TsunamiAlert[]> {
  try {
    const res = await fetch(ALERTS_URL, {
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
