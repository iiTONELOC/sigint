import { useEffect, useState } from "react";
import {
  fetchWaveform,
  type Waveform,
  type WaveformUnavailableReason,
} from "../data/waveform";

export type WaveformState =
  | { status: "loading" }
  | { status: "ready"; waveform: Waveform }
  | { status: "unavailable"; reason: WaveformUnavailableReason };

export function useWaveform(
  lat: number,
  lon: number,
  originTimeIso: string | undefined,
): WaveformState {
  const [state, setState] = useState<WaveformState>({ status: "loading" });

  useEffect(() => {
    if (!originTimeIso) {
      setState({ status: "unavailable", reason: "invalid-event-time" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: "loading" });
    void fetchWaveform(lat, lon, originTimeIso, {
      signal: controller.signal,
    }).then((result) => {
      if (cancelled) return;
      setState(result);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lat, lon, originTimeIso]);

  return state;
}
