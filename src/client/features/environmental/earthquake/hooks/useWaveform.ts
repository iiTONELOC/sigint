import { useEffect, useState } from "react";
import {
  fetchWaveform,
} from "../data/waveform";
import {
  WaveformStatus,
  WaveformUnavailableReason,
  type WaveformState,
} from "../model";

export function useWaveform(
  lat: number,
  lon: number,
  originTimeIso: string | undefined,
): WaveformState {
  const [state, setState] = useState<WaveformState>({
    status: WaveformStatus.Loading,
  });

  useEffect(() => {
    if (!originTimeIso) {
      setState({
        reason: WaveformUnavailableReason.EventTime,
        status: WaveformStatus.Unavailable,
      });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: WaveformStatus.Loading });
    fetchWaveform(lat, lon, originTimeIso, {
      signal: controller.signal,
    }).then(
      (result) => {
        if (!cancelled) setState(result);
      },
      () => {
        if (!cancelled) {
          setState({
            reason: WaveformUnavailableReason.StationService,
            status: WaveformStatus.Unavailable,
          });
        }
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lat, lon, originTimeIso]);

  return state;
}
