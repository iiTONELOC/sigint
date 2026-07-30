// Single source for cyclone classification: the Saffir-Simpson thresholds (used
// to derive category, intensity-curve bands, and display colors) and the
// classification-code → label map. These were copy-pasted across parseNhc,
// the intensity curve, the mini-map, and three dossier/detail components.

import { ktToMph } from "@/lib/format/units";
import { Category, SaffirSimpson } from "./types";

/** Storm classification code → human label (NHC categories). */
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  [Category.TropicalDepression]: "Tropical Depression",
  [Category.TropicalStorm]: "Tropical Storm",
  [Category.Hurricane1]: "Hurricane Cat 1",
  [Category.Hurricane2]: "Hurricane Cat 2",
  [Category.Hurricane3]: "Hurricane Cat 3 (major)",
  [Category.Hurricane4]: "Hurricane Cat 4 (major)",
  [Category.Hurricane5]: "Hurricane Cat 5 (major)",
  [Category.SubtropicalDepression]: "Subtropical Depression",
  [Category.SubtropicalStorm]: "Subtropical Storm",
  [Category.PostTropical]: "Post-Tropical",
};

/** Saffir-Simpson scale, descending. `minKt` = sustained-wind floor for the
 *  category; `label` = short band tag; `color` = display hex. */
export const SAFFIR_SIMPSON: readonly {
  cat: SaffirSimpson;
  minKt: number;
  label: string;
  color: string;
}[] = [
  { cat: 5, minKt: 137, label: "C5", color: "#ff5dff" },
  { cat: 4, minKt: 113, label: "C4", color: "#ff5d5d" },
  { cat: 3, minKt: 96, label: "C3", color: "#ff8c42" },
  { cat: 2, minKt: 83, label: "C2", color: "#ffb142" },
  { cat: 1, minKt: 64, label: "C1", color: "#ffd24a" },
];

export const TS_MIN_KT = 34;
export const HURRICANE_MIN_KT = SAFFIR_SIMPSON.at(-1)?.minKt ?? 64;
const TS_COLOR = "#4ad2ff";
const TD_COLOR = "#8fd3ff";

/** Saffir-Simpson category for a sustained wind in knots. */
export function saffirSimpson(kt: number): SaffirSimpson {
  for (const band of SAFFIR_SIMPSON) if (kt >= band.minKt) return band.cat;
  return SaffirSimpson.None;
}

/** Short category tag for a sustained wind: a band label, or a storm class. */
export function categoryShort(kt: number): string {
  for (const band of SAFFIR_SIMPSON) if (kt >= band.minKt) return band.label;
  return kt >= TS_MIN_KT
    ? Category.TropicalStorm
    : Category.TropicalDepression;
}

/** Saffir-Simpson legend rows: label, color, and the wind range (mph) for each
 *  band, top-down (C5 first). Single source for the map/chart category keys. */
export const SAFFIR_LEGEND: ReadonlyArray<{
  label: string;
  color: string;
  range: string;
}> = [
  ...SAFFIR_SIMPSON.map((b, i) => {
    const upperKt = i === 0 ? null : SAFFIR_SIMPSON[i - 1]!.minKt - 1;
    return {
      label: b.label,
      color: b.color,
      range: upperKt === null ? `${ktToMph(b.minKt)}+ mph` : `${ktToMph(b.minKt)}–${ktToMph(upperKt)} mph`,
    };
  }),
  {
    label: "TS",
    color: TS_COLOR,
    range: `${ktToMph(TS_MIN_KT)}–${ktToMph(SAFFIR_SIMPSON.at(-1)!.minKt - 1)} mph`,
  },
];

/** Display color for a sustained wind in knots (C5 → depression ramp). */
export function windColor(kt: number): string {
  for (const b of SAFFIR_SIMPSON) if (kt >= b.minKt) return b.color;
  if (kt >= TS_MIN_KT) return TS_COLOR;
  return TD_COLOR;
}

/** Color for a wind-radii threshold band (34/50/64 kt). Hottest threshold is the
 *  reddest: 64kt=red, 50kt=amber, 34kt=cyan — matches the dossier legend. */
const RADII_BAND_COLOR: Record<number, string> = {
  64: "#ff5d5d", // red
  50: "#ffd24a", // amber
  34: TS_COLOR, // cyan
};
export function windRadiiBandColor(thresholdKt: number): string {
  return RADII_BAND_COLOR[thresholdKt] ?? TS_COLOR;
}

/** Per-model spaghetti colors, TV-style: each guidance model its own hue so
 *  diverging tracks read distinctly. Official (OFCL) and consensus (TVCN) are
 *  emphasized; others get a stable distinct color, falling back by hash. */
// Mid-tone hues only — each reads on both the dark panel and a light theme
// (no near-white / near-black, which vanish on one or the other).
const MODEL_COLOR: Record<string, string> = {
  OFCL: "#8a5cff", // official — strong violet, the anchor
  TVCN: "#c026d3", // track consensus — fuchsia
  AVNO: "#0ea5e9", // GFS — sky blue
  GFSO: "#0ea5e9",
  EMXI: "#e11d48", // ECMWF — rose red
  EMX: "#e11d48",
  CMC: "#16a34a", // Canadian — green
  CMCI: "#16a34a",
  UKM: "#d97706", // UKMET — amber
  UKMI: "#d97706",
  HWRF: "#ea580c", // HWRF — orange
  HWFI: "#ea580c",
  HMON: "#db2777", // HMON — pink
  HMNI: "#db2777",
  NVGM: "#0891b2", // Navy — teal
  AEMN: "#6b7280", // GEFS mean — slate grey
};

const MODEL_FALLBACK = ["#0ea5e9", "#e11d48", "#16a34a", "#d97706", "#ea580c", "#db2777", "#8a5cff"];

/** Distinct display color for a guidance model code. */
export function modelColor(model: string): string {
  const known = MODEL_COLOR[model];
  if (known) return known;
  let h = 0;
  for (const ch of model) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return MODEL_FALLBACK[h % MODEL_FALLBACK.length]!;
}
