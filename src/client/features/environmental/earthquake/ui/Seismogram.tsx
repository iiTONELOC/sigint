import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { mmiInk } from "../intensity";
import { useWaveform } from "../hooks/useWaveform";
import type { WaveformUnavailableReason } from "../data/waveform";
import { playQuakeAudio } from "../lib/audify";

const VBW = 320;
const VBH = 92;
const MID = VBH / 2;
const PAD = 8;

const UNAVAILABLE_LABEL: Readonly<Record<WaveformUnavailableReason, string>> = {
  "invalid-event-time": "event time unavailable",
  "station-service-unavailable": "station service unavailable",
  "availability-service-unavailable": "station availability unavailable",
  "no-active-station": "no station found near event",
  "no-recorded-trace": "station trace unavailable for event time",
};

function tracePath(samples: number[]): string {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const range = max - min || 1;
  const usableH = VBH - PAD * 2;
  const stepX = VBW / (samples.length - 1);
  let d = "";
  samples.forEach((s, i) => {
    const x = i * stepX;
    const y = PAD + usableH - ((s - min) / range) * usableH;
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
  const color = mmiInk(mmi);
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

  const samples = state.status === "ready" ? state.waveform.rawSamples : null;
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
    }, 5000);
  };

  if (state.status === "loading") {
    return (
      <div className="h-23 flex items-center justify-center text-(length:--sig-text-xs) text-sig-dim">
        acquiring trace…
      </div>
    );
  }
  if (state.status === "unavailable") {
    return (
      <div className="h-23 flex items-center justify-center text-(length:--sig-text-xs) text-sig-dim">
        {UNAVAILABLE_LABEL[state.reason]}
      </div>
    );
  }

  const { waveform } = state;
  return (
    <div>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        className="w-full h-24"
        role="img"
        aria-label="Recorded seismogram trace"
      >
        <line x1="0" y1={MID} x2={VBW} y2={MID} className="stroke-sig-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={tracePath(waveform.samples)} fill="none" strokeWidth="1.1" vectorEffect="non-scaling-stroke" style={{ stroke: color }} />
      </svg>
      <div className="text-(length:--sig-text-xs) text-sig-dim mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleAudio}
          className="flex items-center gap-1 min-h-9 px-1.5 -ml-1.5 rounded cursor-pointer transition-colors hover:text-sig-bright"
          style={{ color }}
          aria-label={playing ? "Stop quake audio" : "Listen to the quake"}
        >
          {playing ? <Square className="w-3 h-3" aria-hidden="true" /> : <Play className="w-3 h-3" aria-hidden="true" />}
          {playing ? "STOP" : "LISTEN"}
        </button>
        <span>
          {waveform.network}·{waveform.station} {waveform.channel} · {waveform.sampleRate} sps · EarthScope
        </span>
      </div>
    </div>
  );
}
