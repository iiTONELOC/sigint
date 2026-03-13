import { useEffect, useState } from "react";
import {
  type DataPoint,
  generateMockAircraft,
  generateMockNonAircraft,
} from "./mockData";

const CACHE_DURATION = 235_000; // 235 s — anonymous OpenSky: 400 credits/day ≈ 1 req per 3.6 min

let cache: { data: DataPoint[]; timestamp: number } | null = null;
let fetchInProgress: Promise<DataPoint[]> | null = null;

async function fetchOpenSkyStates(): Promise<DataPoint[]> {
  try {
    const response = await fetch("https://opensky-network.org/api/states/all");

    if (!response.ok) {
      console.error(`OpenSky API error: ${response.status}`);
      return generateMockAircraft();
    }

    const raw = await response.json();

    if (!raw.states || !Array.isArray(raw.states)) {
      console.error("Invalid OpenSky response format");
      return generateMockAircraft();
    }

    const aircraft: DataPoint[] = raw.states
      .filter((s: any) => s[0] && s[5] !== null && s[6] !== null)
      .map(
        (s: any) =>
          ({
            id: `A${s[0]}`,
            type: "aircraft" as const,
            lat: s[6],
            lon: s[5],
            timestamp: new Date().toISOString(),
            data: {
              icao24: s[0],
              callsign: s[1]?.trim() || "Unknown",
              originCountry: s[2] || "",
              acType: s[0] || "Unknown",
              altitude: s[13] || 0,
              speed: s[9] ? Math.round(s[9] * 1.944) : 0, // m/s → knots
              heading: Math.round(s[10] ?? 0),
              verticalRate: s[11],
              onGround: s[8] === true,
              squawk: s[14] != null ? String(s[14]) : undefined,
              squawkStatus:
                String(s[14]) === "7700"
                  ? "emergency"
                  : String(s[14]) === "7600"
                    ? "alert"
                    : String(s[14]) === "7500"
                      ? "alert"
                      : "normal",
            },
          }) as DataPoint,
      );

    console.log(`Fetched ${aircraft.length} aircraft from OpenSky`);
    return aircraft;
  } catch (error) {
    console.error("OpenSky fetch error:", error);
    return generateMockAircraft();
  }
}

function getAircraftData(): Promise<DataPoint[]> {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_DURATION) {
    return Promise.resolve(cache.data);
  }

  if (fetchInProgress) {
    return cache ? Promise.resolve(cache.data) : fetchInProgress;
  }

  fetchInProgress = fetchOpenSkyStates()
    .then((data) => {
      cache = { data, timestamp: Date.now() };
      fetchInProgress = null;
      return data;
    })
    .catch((err) => {
      fetchInProgress = null;
      console.error("OpenSky update failed:", err);
      return cache?.data ?? generateMockAircraft();
    });

  if (cache) return Promise.resolve(cache.data);
  return fetchInProgress;
}

// ---------------------------------------------------------------------------

interface UseAircraftDataResult {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
}

export function useAircraftData(
  pollInterval: number = 240_000, // 4 min — stays under 400 credits/day for anonymous OpenSky
): UseAircraftDataResult {
  const initialMockData = [
    ...generateMockNonAircraft(),
    ...generateMockAircraft(),
  ];

  const [data, setData] = useState<DataPoint[]>(initialMockData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const refresh = async () => {
      try {
        const aircraftData = await getAircraftData();
        if (!isMounted) return;
        setData([...generateMockNonAircraft(), ...aircraftData]);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to fetch aircraft data:", err);
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
      }
    };

    refresh();
    intervalId = setInterval(refresh, pollInterval);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval]);

  return { data, loading, error };
}
