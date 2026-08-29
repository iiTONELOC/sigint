export enum MarkerAgeSpan {
  RecentHours = 6,
  SeveralDays = 3,
}

export enum MarkerDepthAlpha {
  Base = 0.4,
  Gain = 0.6,
  StandardGain = 0.8,
}

export type MarkerStyle = Readonly<{
  size: number;
  alpha: number;
}>;

export type MarkerGlow = Readonly<{
  idSliceFrom: number;
  rate: number;
  baseAmp: number;
  ampGain: number;
  radBase: number;
  radGain?: number;
  alphaHex: string;
  glowMul: number;
}>;

export type MarkerPulseZoom = Readonly<{
  floor: number;
  span: number;
}>;

export type MarkerSourcePolicy = Readonly<{
  ageAlphaByMaximumMs: Readonly<Record<number, number>>;
  agedAlpha: number;
  animationThreshold: number;
  glow: MarkerGlow;
  markerAlphaGain: number;
  maximumSize: number;
  pulseBase?: number;
  pulseSpan: number;
  pulseZoom?: MarkerPulseZoom;
  selectedScale: number;
  sizeByMaximum: Readonly<Record<number, number>>;
}>;

export type MarkerPulse = Readonly<{
  glow: MarkerGlow;
  index: number;
}>;

export function sourceMarkerAgeAlpha(
  timestamp: number,
  now: number,
  policy: MarkerSourcePolicy,
): number {
  if (timestamp === 0) return policy.agedAlpha;
  const age = now - timestamp;
  for (const [maximumAgeMs, alpha] of Object.entries(
    policy.ageAlphaByMaximumMs,
  )) {
    if (age < Number(maximumAgeMs)) return alpha;
  }
  return policy.agedAlpha;
}

export function sourceMarkerFillAlpha(
  depth: number,
  ageAlpha: number,
  policy: MarkerSourcePolicy,
): number {
  return (
    (MarkerDepthAlpha.Base + depth * MarkerDepthAlpha.Gain) *
    ageAlpha *
    policy.markerAlphaGain
  );
}

export function sourceMarkerPulseIndex(
  value: number,
  policy: MarkerSourcePolicy,
): number {
  return Math.min(
    1,
    (value - (policy.pulseBase ?? policy.animationThreshold)) /
      policy.pulseSpan,
  );
}

export function sourceMarkerSize(
  value: number,
  selected: boolean,
  policy: MarkerSourcePolicy,
): number {
  let size = policy.maximumSize;
  for (const [maximum, candidate] of Object.entries(
    policy.sizeByMaximum,
  )) {
    if (value >= Number(maximum)) continue;
    size = candidate;
    break;
  }
  return size * (selected ? policy.selectedScale : 1);
}
