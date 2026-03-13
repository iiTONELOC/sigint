import { generateMockAircraft } from "@/lib/mockData";
import type { DataPoint } from "@/lib/mockData";

// OpenSky API cache
let openSkyCache: { data: DataPoint[]; timestamp: number } | null = null;
const CACHE_DURATION = 55000; // 55 seconds (polls every 60 seconds)

async function fetchOpenSkyStates(): Promise<DataPoint[]> {
  try {
    const response = await fetch("https://opensky-network.org/api/states/all");

    if (!response.ok) {
      console.error(`OpenSky API error: ${response.status}`);
      return generateMockAircraft();
    }

    const data = await response.json();

    if (!data.states || !Array.isArray(data.states)) {
      console.error("Invalid OpenSky response format");
      return generateMockAircraft();
    }

    // Map OpenSky state vectors to our DataPoint format
    let aircraft: DataPoint[] = data.states
      .filter((state: any) => {
        return state[0] && state[5] !== null && state[6] !== null;
      })
      .map((state: any) => {
        const icao24 = state[0];
        const callsign = state[1]?.trim() || "";
        const originCountry = state[2] || "";
        const lon = state[5];
        const lat = state[6];
        const velocity = state[9];
        const heading = state[10] !== null ? state[10] : 0;
        const verticalRate = state[11];
        const altitude = state[13];

        return {
          id: `A${icao24}`,
          type: "aircraft" as const,
          lat,
          lon,
          timestamp: new Date().toISOString(),
          data: {
            icao24,
            callsign: callsign || "Unknown",
            originCountry,
            acType: callsign || "Unknown",
            altitude: altitude || 0,
            speed: velocity ? Math.round(velocity * 1.944) : 0, // Convert m/s to knots
            heading: Math.round(heading || 0),
            verticalRate,
          },
        } as DataPoint;
      });

    console.log(`Fetched ${aircraft.length} aircraft from OpenSky`);
    return aircraft;
  } catch (error) {
    console.error("OpenSky fetch error:", error);
    return generateMockAircraft();
  }
}

async function getAircraftData(): Promise<DataPoint[]> {
  const now = Date.now();

  if (openSkyCache && now - openSkyCache.timestamp < CACHE_DURATION) {
    console.log("Returning cached aircraft data");
    return openSkyCache.data;
  }

  const aircraft = await fetchOpenSkyStates();
  openSkyCache = { data: aircraft, timestamp: now };

  return aircraft;
}

export async function handleAircraftRequest(): Promise<Response> {
  const aircraft = await getAircraftData();
  return Response.json(aircraft);
}
