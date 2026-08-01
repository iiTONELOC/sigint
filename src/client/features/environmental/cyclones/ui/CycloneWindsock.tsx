import { CycloneWindThreshold, windColor } from "../classification";

enum WindsockAngle {
  LimpDegrees = 60,
  ExtendedDegrees = 0,
  WideSwayDegrees = 14,
  TautSwayDegrees = 1.5,
}

enum WindsockTiming {
  SlowFlutterSeconds = 1.4,
  FastFlutterSeconds = 0.32,
  SlowStreakSeconds = 1.6,
  FastStreakSeconds = 0.5,
}

enum WindsockFraction {
  Minimum = 0,
  Maximum = 1,
}

enum WindsockPolicy {
  FullExtensionMultiplier = 2,
}

enum WindsockOpacity {
  MinimumStreak = 0.15,
  MaximumStreak = 0.7,
}

enum WindsockPrecision {
  Sway = 1,
  Timing = 2,
}

enum WindsockAnimation {
  Repeat = "indefinite",
}

enum WindsockGeometry {
  PivotX = 7,
  PivotY = 16,
  StreakDistance = 80,
}

enum WindsockSvgAttribute {
  Transform = "transform",
  Opacity = "opacity",
}

enum WindsockClassName {
  MotionReduceHidden = "motion-reduce:hidden",
}

const STREAKS = [
  { d: "M0,12 q5,-3 10,0 t10,0", delaySeconds: 0 },
  { d: "M0,16 h18", delaySeconds: 0.3 },
  { d: "M0,20 q5,3 10,0 t10,0", delaySeconds: 0.6 },
];

function windFraction(maxWindKt: number): number {
  const fullExtensionKnots =
    CycloneWindThreshold.HurricaneOne *
    WindsockPolicy.FullExtensionMultiplier;
  return Math.min(
    WindsockFraction.Maximum,
    Math.max(WindsockFraction.Minimum, maxWindKt / fullExtensionKnots),
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function CycloneWindsock({ maxWindKt }: { readonly maxWindKt: number }) {
  if (maxWindKt < CycloneWindThreshold.TropicalStorm) return null;
  const color = windColor(maxWindKt);
  const t = windFraction(maxWindKt);
  const droop = lerp(
    WindsockAngle.LimpDegrees,
    WindsockAngle.ExtendedDegrees,
    t,
  );
  const flutter = lerp(
    WindsockTiming.SlowFlutterSeconds,
    WindsockTiming.FastFlutterSeconds,
    t,
  ).toFixed(WindsockPrecision.Timing);
  const sway = lerp(
    WindsockAngle.WideSwayDegrees,
    WindsockAngle.TautSwayDegrees,
    t,
  ).toFixed(WindsockPrecision.Sway);
  const streak = lerp(
    WindsockTiming.SlowStreakSeconds,
    WindsockTiming.FastStreakSeconds,
    t,
  ).toFixed(WindsockPrecision.Timing);
  const streakOpacity = lerp(
    WindsockOpacity.MinimumStreak,
    WindsockOpacity.MaximumStreak,
    t,
  ).toFixed(WindsockPrecision.Timing);

  return (
    <svg
      viewBox="0 0 48 40"
      className="h-8 w-10 shrink-0"
      role="img"
      aria-label="Wind intensity sock"
    >
      <line x1="7" y1="3" x2="7" y2="38" stroke="currentColor" strokeWidth="2" className="text-sig-dim" />
      <circle cx="7" cy="16" r="2" className="fill-sig-dim" />
      <g
        transform={`rotate(${droop} ${WindsockGeometry.PivotX} ${WindsockGeometry.PivotY})`}
      >
        <g>
          <animateTransform
            attributeName={WindsockSvgAttribute.Transform}
            type="rotate"
            values={`-${sway} ${WindsockGeometry.PivotX} ${WindsockGeometry.PivotY};${sway} ${WindsockGeometry.PivotX} ${WindsockGeometry.PivotY};-${sway} ${WindsockGeometry.PivotX} ${WindsockGeometry.PivotY}`}
            dur={`${flutter}s`}
            repeatCount={WindsockAnimation.Repeat}
            className={WindsockClassName.MotionReduceHidden}
          />
          <polygon points="7,6 19,8 19,24 7,26" fill={color} fillOpacity="0.95" />
          <polygon points="19,8 30,10.5 30,21.5 19,24" fill={color} fillOpacity="0.78" />
          <polygon points="30,10.5 42,13 42,19 30,21.5" fill={color} fillOpacity="0.6" />
        </g>
      </g>
      <g className="text-sig-dim">
        {STREAKS.map((streakDefinition) => (
          <path
            key={streakDefinition.d}
            d={streakDefinition.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity={streakOpacity}
          >
            <animateTransform
              attributeName={WindsockSvgAttribute.Transform}
              type="translate"
              values={`0 0;${WindsockGeometry.StreakDistance} 0`}
              dur={`${streak}s`}
              begin={`${streakDefinition.delaySeconds}s`}
              repeatCount={WindsockAnimation.Repeat}
              className={WindsockClassName.MotionReduceHidden}
            />
            <animate
              attributeName={WindsockSvgAttribute.Opacity}
              values="0;1;1;0"
              keyTimes="0;0.25;0.75;1"
              dur={`${streak}s`}
              begin={`${streakDefinition.delaySeconds}s`}
              repeatCount={WindsockAnimation.Repeat}
              className={WindsockClassName.MotionReduceHidden}
            />
          </path>
        ))}
      </g>
    </svg>
  );
}
