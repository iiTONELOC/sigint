import type { CSSProperties } from "react";
import { TS_MIN_KT, HURRICANE_MIN_KT, windColor } from "../classification";

const LIMP_DEG = 60;
const EXTENDED_DEG = 0;
const FULL_EXTENSION_KT = HURRICANE_MIN_KT * 2;
const SLOW_FLUTTER_S = 1.4;
const FAST_FLUTTER_S = 0.32;
const WIDE_SWAY_DEG = 14;
const TAUT_SWAY_DEG = 1.5;
const SLOW_STREAK_S = 1.6;
const FAST_STREAK_S = 0.5;
const STREAKS = [
  { d: "M0,12 q5,-3 10,0 t10,0", delay: "0s" },
  { d: "M0,16 h18", delay: "0.3s" },
  { d: "M0,20 q5,3 10,0 t10,0", delay: "0.6s" },
];

function windFraction(maxWindKt: number): number {
  return Math.min(1, Math.max(0, maxWindKt / FULL_EXTENSION_KT));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function CycloneWindsock({ maxWindKt }: { readonly maxWindKt: number }) {
  if (maxWindKt < TS_MIN_KT) return null;
  const color = windColor(maxWindKt);
  const t = windFraction(maxWindKt);
  const droop = lerp(LIMP_DEG, EXTENDED_DEG, t);
  const flutter = lerp(SLOW_FLUTTER_S, FAST_FLUTTER_S, t).toFixed(2);
  const sway = lerp(WIDE_SWAY_DEG, TAUT_SWAY_DEG, t).toFixed(1);
  const streak = lerp(SLOW_STREAK_S, FAST_STREAK_S, t).toFixed(2);
  const streakOpacity = lerp(0.15, 0.7, t).toFixed(2);

  return (
    <svg
      viewBox="0 0 48 40"
      className="h-8 w-10 shrink-0"
      role="img"
      aria-label="Wind intensity sock"
    >
      <line x1="7" y1="3" x2="7" y2="38" stroke="currentColor" strokeWidth="2" className="text-sig-dim" />
      <circle cx="7" cy="16" r="2" className="fill-sig-dim" />
      <g className="origin-[7px_16px]" style={{ transform: `rotate(${droop}deg)` }}>
        <g
          className="origin-[7px_16px] motion-reduce:animate-none animate-[windsock-flutter_var(--sock-flutter)_ease-in-out_infinite]"
          style={{ "--sock-flutter": `${flutter}s`, "--sock-sway": `${sway}deg` } as CSSProperties}
        >
          <polygon points="7,6 19,8 19,24 7,26" fill={color} fillOpacity="0.95" />
          <polygon points="19,8 30,10.5 30,21.5 19,24" fill={color} fillOpacity="0.78" />
          <polygon points="30,10.5 42,13 42,19 30,21.5" fill={color} fillOpacity="0.6" />
        </g>
      </g>
      <g className="text-sig-dim">
        {STREAKS.map((s) => (
          <path
            key={s.d}
            d={s.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity={streakOpacity}
            className="motion-reduce:animate-none animate-[wind-streak_var(--streak-dur)_linear_infinite]"
            style={{ "--streak-dur": `${streak}s`, animationDelay: s.delay } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
}
