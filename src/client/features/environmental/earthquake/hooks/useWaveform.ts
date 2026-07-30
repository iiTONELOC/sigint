import { useEffect, useState } from "react";
import { fetchWaveform, type Waveform } from "../data/waveform";

export type WaveformState =
  | { status: "loading" }
  | { status: "ready"; waveform: Waveform }
  | { status: "empty" };

export function useWaveform(
  lat: number,
  lon: number,
  originTimeIso: string | undefined,
): WaveformState {
  const [state, setState] = useState<WaveformState>({ status: "loading" });

  useEffect(() => {
    if (!originTimeIso) {
      setState({ status: "empty" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void fetchWaveform(lat, lon, originTimeIso).then((waveform) => {
      if (cancelled) return;
      setState(waveform ? { status: "ready", waveform } : { status: "empty" });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, originTimeIso]);

  return state;
}
