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
  radGain: number;
  alphaHex: string;
  glowMul: number;
}>;

export type MarkerPulse = Readonly<{
  glow: MarkerGlow;
  index: number;
}>;
