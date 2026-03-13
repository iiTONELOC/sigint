import { useEffect, useState } from "react";
import {
  type DataPoint,
  generateMockAircraft,
  generateMockNonAircraft,
} from "./mockData";

interface UseAircraftDataResult {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
}

export function useAircraftData(
  pollInterval: number = 60000, // 60 seconds = 1 minute
): UseAircraftDataResult {
  // Start with mock data for instant first paint
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

    const fetchAircraftData = async () => {
      try {
        const response = await fetch("/api/aircraft");

        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }

        const aircraftData = await response.json();

        if (!isMounted) return;

        // Combine real aircraft data with mock non-aircraft data
        const nonAircraftData = generateMockNonAircraft();
        const allData = [...nonAircraftData, ...aircraftData];

        setData(allData);
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

    // Fetch real data immediately, but don't block render
    fetchAircraftData();

    // Set up polling for updates
    intervalId = setInterval(fetchAircraftData, pollInterval);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval]);

  return { data, loading, error };
}
