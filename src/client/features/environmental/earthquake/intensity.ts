function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type MmiBand = {
  level: number;
  roman: string;
  label: string;
  damage: string;
  color: string;
  ink: string;
};

const MMI_FLOOR: MmiBand = { level: 1, roman: "I", label: "NOT FELT", damage: "instrumental", color: "#9aa7b8", ink: "#6b7a8d" };

export const MMI_SCALE: readonly MmiBand[] = [
  { level: 10, roman: "X+", label: "EXTREME", damage: "total destruction", color: "#9c1414", ink: "#c01818" },
  { level: 9, roman: "IX", label: "VIOLENT", damage: "heavy damage", color: "#e02b2b", ink: "#d42424" },
  { level: 8, roman: "VIII", label: "SEVERE", damage: "moderate-heavy damage", color: "#ff8c1a", ink: "#e07000" },
  { level: 7, roman: "VII", label: "VERY STRONG", damage: "moderate damage", color: "#ffc400", ink: "#c79400" },
  { level: 6, roman: "VI", label: "STRONG", damage: "light damage", color: "#ffe000", ink: "#b59700" },
  { level: 5, roman: "V", label: "MODERATE", damage: "felt by all", color: "#7ad27a", ink: "#3fa83f" },
  { level: 4, roman: "IV", label: "LIGHT", damage: "felt indoors", color: "#7fc6e6", ink: "#3592c0" },
  { level: 3, roman: "II–III", label: "WEAK", damage: "felt by some", color: "#8c9ecf", ink: "#6677b0" },
  MMI_FLOOR,
];

const DEPTH_NEAR_KM = 10;
const DEPTH_FAR_KM = 700;
const SHALLOW_MAX_KM = 70;

export function mmiBand(level: number): MmiBand {
  const rounded = clamp(Math.round(level), 1, 10);
  return MMI_SCALE.find((b) => rounded >= b.level) ?? MMI_FLOOR;
}

export function mmiColor(level: number): string {
  return mmiBand(level).color;
}

export function mmiInk(level: number): string {
  return mmiBand(level).ink;
}

export function estimateMmi(magnitude: number, depthKm?: number): number {
  const depth = depthKm == null ? DEPTH_NEAR_KM : clamp(depthKm, DEPTH_NEAR_KM, DEPTH_FAR_KM);
  const depthPenalty = 1.8 * Math.log10(depth / DEPTH_NEAR_KM);
  const raw = 1.5 * magnitude - 1.8 - depthPenalty;
  return clamp(raw, 1, 10);
}

export function isShallow(depthKm?: number): boolean {
  return depthKm != null && depthKm <= SHALLOW_MAX_KM;
}
