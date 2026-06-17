// Single source for cyclone classification: the Saffir-Simpson thresholds (used
// to derive category, intensity-curve bands, and display colors) and the
// classification-code → label map. These were copy-pasted across parseNhc,
// the intensity curve, the mini-map, and three dossier/detail components.

/** Section-heading accent for cyclone panels — the storm red lightened toward
 *  white so it reads cleanly as text on the dark theme. One source for the
 *  dossier accent context + the detail-pane headings. */
export const CYCLONE_HEADING =
  "color-mix(in srgb, var(--sigint-cyclones) 65%, white)";

/** Storm classification code → human label (NHC categories). */
export const CATEGORY_LABEL: Record<string, string> = {
  TD: "Tropical Depression",
  TS: "Tropical Storm",
  HU1: "Hurricane Cat 1",
  HU2: "Hurricane Cat 2",
  HU3: "Hurricane Cat 3 (major)",
  HU4: "Hurricane Cat 4 (major)",
  HU5: "Hurricane Cat 5 (major)",
  STD: "Subtropical Depression",
  STS: "Subtropical Storm",
  PT: "Post-Tropical",
};

/** Saffir-Simpson scale, descending. `minKt` = sustained-wind floor for the
 *  category; `label` = short band tag; `color` = display hex. */
export const SAFFIR_SIMPSON = [
  { cat: 5 as const, minKt: 137, label: "C5", color: "#ff5dff" },
  { cat: 4 as const, minKt: 113, label: "C4", color: "#ff5d5d" },
  { cat: 3 as const, minKt: 96, label: "C3", color: "#ff8c42" },
  { cat: 2 as const, minKt: 83, label: "C2", color: "#ffb142" },
  { cat: 1 as const, minKt: 64, label: "C1", color: "#ffd24a" },
];

export const TS_MIN_KT = 34;
const TS_COLOR = "#4ad2ff";
const TD_COLOR = "#8fd3ff";

/** Saffir-Simpson category (1-5) for a sustained wind in knots; 0 = below hurricane. */
export function saffirSimpson(kt: number): 0 | 1 | 2 | 3 | 4 | 5 {
  for (const b of SAFFIR_SIMPSON) if (kt >= b.minKt) return b.cat;
  return 0;
}

/** Display color for a sustained wind in knots (C5 → depression ramp). */
export function windColor(kt: number): string {
  for (const b of SAFFIR_SIMPSON) if (kt >= b.minKt) return b.color;
  if (kt >= TS_MIN_KT) return TS_COLOR;
  return TD_COLOR;
}
