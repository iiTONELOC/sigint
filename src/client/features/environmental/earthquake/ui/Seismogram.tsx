import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { MmiCssColor, mmiBand } from "../intensity";
import { useWaveform } from "../hooks/useWaveform";
import {
  WaveformStatus,
  WaveformUnavailableReason,
} from "../model";
import { playQuakeAudio } from "../lib/audify";

enum SeismogramGeometry {
  ViewBoxWidth = 320,
  ViewBoxHeight = 92,
  Padding = 8,
}

enum SeismogramTiming {
  AudioDurationMilliseconds = 5_000,
}

enum SeismogramSvgValue {
  IconClass = "w-3 h-3",
  NoFill = "none",
  NonScalingStroke = "non-scaling-stroke",
  TraceStrokeWidth = "1.1",
}

function unavailableLabel(reason: WaveformUnavailableReason): string {
  switch (reason) {
    case WaveformUnavailableReason.Station:
      return "no station found near event";
    case WaveformUnavailableReason.RecordedTrace:
      return "station trace unavailable for event time";
    case WaveformUnavailableReason.StationService:
      return "station service unavailable";
    default:
      return "event time unavailable";
  }
}

function tracePath(samples: number[]): string {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const range = max - min || 1;
  const usableHeight =
    SeismogramGeometry.ViewBoxHeight - SeismogramGeometry.Padding * 2;
  const stepX = SeismogramGeometry.ViewBoxWidth / (samples.length - 1);
  let d = "";
  samples.forEach((s, i) => {
    const x = i * stepX;
    const y =
      SeismogramGeometry.Padding +
      usableHeight -
      ((s - min) / range) * usableHeight;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  return d.trim();
}

export function Seismogram({
  lat,
  lon,
  originTimeIso,
  mmi,
}: {
  readonly lat: number;
  readonly lon: number;
  readonly originTimeIso?: string;
  readonly mmi: number;
}) {
  const state = useWaveform(lat, lon, originTimeIso);
  const band = mmiBand(mmi);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      setPlaying(false);
    };
  }, [lat, lon, originTimeIso]);

  const samples =
    state.status === WaveformStatus.Ready ? state.waveform.rawSamples : null;
  const toggleAudio = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (playing) {
      playerRef.current?.stop();
      playerRef.current = null;
      setPlaying(false);
      return;
    }
    if (!samples) return;
    const player = playQuakeAudio(samples);
    if (!player) return;
    playerRef.current = player;
    setPlaying(true);
    timerRef.current = globalThis.setTimeout(() => {
      playerRef.current?.stop();
      playerRef.current = null;
      timerRef.current = null;
      setPlaying(false);
    }, SeismogramTiming.AudioDurationMilliseconds);
  };

  if (state.status === WaveformStatus.Loading) {
    return (
      <div className="h-23 flex items-center justify-center text-(length:--sig-text-xs) text-sig-dim">
        acquiring trace…
      </div>
    );
  }
  if (state.status === WaveformStatus.Unavailable) {
    return (
      <div className="h-23 flex items-center justify-center text-(length:--sig-text-xs) text-sig-dim">
        {unavailableLabel(state.reason)}
      </div>
    );
  }

  const { waveform } = state;
  return (
    <div className={band.className}>
      <svg
        viewBox={`0 0 ${SeismogramGeometry.ViewBoxWidth} ${SeismogramGeometry.ViewBoxHeight}`}
        preserveAspectRatio="none"
        className="w-full h-24"
        role="img"
        aria-label="Recorded seismogram trace"
      >
        <line
          x1="0"
          y1={SeismogramGeometry.ViewBoxHeight / 2}
          x2={SeismogramGeometry.ViewBoxWidth}
          y2={SeismogramGeometry.ViewBoxHeight / 2}
          className="stroke-sig-border"
          strokeWidth="1"
          vectorEffect={SeismogramSvgValue.NonScalingStroke}
        />
        <path
          d={tracePath(waveform.samples)}
          fill={SeismogramSvgValue.NoFill}
          stroke={MmiCssColor.Accent}
          strokeWidth={SeismogramSvgValue.TraceStrokeWidth}
          vectorEffect={SeismogramSvgValue.NonScalingStroke}
        />
      </svg>
      <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleAudio}
          className="flex items-center gap-1 min-h-9 px-1.5 -ml-1.5 rounded cursor-pointer text-(--dossier-accent) transition-colors hover:text-sig-bright"
          aria-label={playing ? "Stop quake audio" : "Listen to the quake"}
        >
          {playing ? (
            <Square className={SeismogramSvgValue.IconClass} aria-hidden />
          ) : (
            <Play className={SeismogramSvgValue.IconClass} aria-hidden />
          )}
          {playing ? "STOP" : "LISTEN"}
        </button>
        <span>
          {waveform.network}·{waveform.station} {waveform.channel} · {waveform.sampleRate} sps · EarthScope
        </span>
      </div>
    </div>
  );
}
