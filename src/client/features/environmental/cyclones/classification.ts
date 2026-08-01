import { ktToMph } from "@/measurements";
import { isEnumValue } from "@shared/types/enum";
import { Category, SaffirSimpson } from "./types";

export enum CycloneCategoryLabel {
  Td = "Tropical Depression",
  Ts = "Tropical Storm",
  Hu1 = "Hurricane Cat 1",
  Hu2 = "Hurricane Cat 2",
  Hu3 = "Hurricane Cat 3 (major)",
  Hu4 = "Hurricane Cat 4 (major)",
  Hu5 = "Hurricane Cat 5 (major)",
  Std = "Subtropical Depression",
  Sts = "Subtropical Storm",
  Pt = "Post-Tropical",
}

export const CATEGORY_LABEL: Readonly<Record<Category, CycloneCategoryLabel>> = {
  [Category.TropicalDepression]: CycloneCategoryLabel.Td,
  [Category.TropicalStorm]: CycloneCategoryLabel.Ts,
  [Category.Hurricane1]: CycloneCategoryLabel.Hu1,
  [Category.Hurricane2]: CycloneCategoryLabel.Hu2,
  [Category.Hurricane3]: CycloneCategoryLabel.Hu3,
  [Category.Hurricane4]: CycloneCategoryLabel.Hu4,
  [Category.Hurricane5]: CycloneCategoryLabel.Hu5,
  [Category.SubtropicalDepression]: CycloneCategoryLabel.Std,
  [Category.SubtropicalStorm]: CycloneCategoryLabel.Sts,
  [Category.PostTropical]: CycloneCategoryLabel.Pt,
};

export enum CycloneWindThreshold {
  TropicalStorm = 34,
  StrongWindRadiusKnots = 50,
  HurricaneOne = 64,
  HurricaneTwo = 83,
  HurricaneThree = 96,
  HurricaneFour = 113,
  HurricaneFive = 137,
}

export enum CycloneBandLabel {
  TropicalStorm = "TS",
  CategoryOne = "C1",
  CategoryTwo = "C2",
  CategoryThree = "C3",
  CategoryFour = "C4",
  CategoryFive = "C5",
}

export enum CycloneWindColor {
  CategoryFive = "#ff5dff",
  HurricaneRed = "#ff5d5d",
  CategoryThree = "#ff8c42",
  CategoryTwo = "#ffb142",
  HurricaneAmber = "#ffd24a",
  TropicalStorm = "#4ad2ff",
  TropicalDepression = "#8fd3ff",
}

enum CycloneBandIndex {
  Last = -1,
  First = 0,
  PreviousOffset = 1,
}

export const SAFFIR_SIMPSON: readonly {
  cat: SaffirSimpson;
  minKt: number;
  label: CycloneBandLabel;
  color: CycloneWindColor;
}[] = [
  {
    cat: SaffirSimpson.Cat5,
    minKt: CycloneWindThreshold.HurricaneFive,
    label: CycloneBandLabel.CategoryFive,
    color: CycloneWindColor.CategoryFive,
  },
  {
    cat: SaffirSimpson.Cat4,
    minKt: CycloneWindThreshold.HurricaneFour,
    label: CycloneBandLabel.CategoryFour,
    color: CycloneWindColor.HurricaneRed,
  },
  {
    cat: SaffirSimpson.Cat3,
    minKt: CycloneWindThreshold.HurricaneThree,
    label: CycloneBandLabel.CategoryThree,
    color: CycloneWindColor.CategoryThree,
  },
  {
    cat: SaffirSimpson.Cat2,
    minKt: CycloneWindThreshold.HurricaneTwo,
    label: CycloneBandLabel.CategoryTwo,
    color: CycloneWindColor.CategoryTwo,
  },
  {
    cat: SaffirSimpson.Cat1,
    minKt: CycloneWindThreshold.HurricaneOne,
    label: CycloneBandLabel.CategoryOne,
    color: CycloneWindColor.HurricaneAmber,
  },
];

/** Saffir-Simpson category for a sustained wind in knots. */
export function saffirSimpson(kt: number): SaffirSimpson {
  for (const band of SAFFIR_SIMPSON) if (kt >= band.minKt) return band.cat;
  return SaffirSimpson.None;
}

/** Short category tag for a sustained wind: a band label, or a storm class. */
export function categoryShort(kt: number): string {
  for (const band of SAFFIR_SIMPSON) if (kt >= band.minKt) return band.label;
  return kt >= CycloneWindThreshold.TropicalStorm
    ? Category.TropicalStorm
    : Category.TropicalDepression;
}

export const SAFFIR_LEGEND: ReadonlyArray<{
  label: string;
  color: string;
  range: string;
}> = [
  ...SAFFIR_SIMPSON.map((b, i) => {
    const upperKt = i === CycloneBandIndex.First
      ? null
      : SAFFIR_SIMPSON[i - CycloneBandIndex.PreviousOffset]!.minKt -
        CycloneBandIndex.PreviousOffset;
    return {
      label: b.label,
      color: b.color,
      range: upperKt === null
        ? `${ktToMph(b.minKt)}+ mph`
        : `${ktToMph(b.minKt)}-${ktToMph(upperKt)} mph`,
    };
  }),
  {
    label: CycloneBandLabel.TropicalStorm,
    color: CycloneWindColor.TropicalStorm,
    range: `${ktToMph(CycloneWindThreshold.TropicalStorm)}-${ktToMph(
      SAFFIR_SIMPSON.at(CycloneBandIndex.Last)!.minKt -
        CycloneBandIndex.PreviousOffset,
    )} mph`,
  },
];

export function windColor(kt: number): string {
  for (const b of SAFFIR_SIMPSON) if (kt >= b.minKt) return b.color;
  if (kt >= CycloneWindThreshold.TropicalStorm) {
    return CycloneWindColor.TropicalStorm;
  }
  return CycloneWindColor.TropicalDepression;
}

export function windRadiiBandColor(thresholdKt: number): string {
  if (thresholdKt >= CycloneWindThreshold.HurricaneOne) {
    return CycloneWindColor.HurricaneRed;
  }
  if (thresholdKt >= CycloneWindThreshold.TropicalStorm) {
    return thresholdKt > CycloneWindThreshold.TropicalStorm
      ? CycloneWindColor.HurricaneAmber
      : CycloneWindColor.TropicalStorm;
  }
  return CycloneWindColor.TropicalStorm;
}

enum CycloneModelCode {
  Official = "OFCL",
  Consensus = "TVCN",
  Gfs = "AVNO",
  GfsOperational = "GFSO",
  Ecmwf = "EMXI",
  EcmwfOperational = "EMX",
  Canadian = "CMC",
  CanadianInterpolated = "CMCI",
  Ukmet = "UKM",
  UkmetInterpolated = "UKMI",
  Hwrf = "HWRF",
  HwrfInterpolated = "HWFI",
  Hmon = "HMON",
  HmonInterpolated = "HMNI",
  Navy = "NVGM",
  GefsMean = "AEMN",
}

enum CycloneModelColor {
  Violet = "#8a5cff",
  Fuchsia = "#c026d3",
  Sky = "#0ea5e9",
  Rose = "#e11d48",
  Green = "#16a34a",
  Amber = "#d97706",
  Orange = "#ea580c",
  Pink = "#db2777",
  Teal = "#0891b2",
  Slate = "#6b7280",
}

enum CycloneColorHash {
  Seed = 0,
  Multiplier = 31,
}

const MODEL_COLOR: Readonly<Record<CycloneModelCode, CycloneModelColor>> = {
  [CycloneModelCode.Official]: CycloneModelColor.Violet,
  [CycloneModelCode.Consensus]: CycloneModelColor.Fuchsia,
  [CycloneModelCode.Gfs]: CycloneModelColor.Sky,
  [CycloneModelCode.GfsOperational]: CycloneModelColor.Sky,
  [CycloneModelCode.Ecmwf]: CycloneModelColor.Rose,
  [CycloneModelCode.EcmwfOperational]: CycloneModelColor.Rose,
  [CycloneModelCode.Canadian]: CycloneModelColor.Green,
  [CycloneModelCode.CanadianInterpolated]: CycloneModelColor.Green,
  [CycloneModelCode.Ukmet]: CycloneModelColor.Amber,
  [CycloneModelCode.UkmetInterpolated]: CycloneModelColor.Amber,
  [CycloneModelCode.Hwrf]: CycloneModelColor.Orange,
  [CycloneModelCode.HwrfInterpolated]: CycloneModelColor.Orange,
  [CycloneModelCode.Hmon]: CycloneModelColor.Pink,
  [CycloneModelCode.HmonInterpolated]: CycloneModelColor.Pink,
  [CycloneModelCode.Navy]: CycloneModelColor.Teal,
  [CycloneModelCode.GefsMean]: CycloneModelColor.Slate,
};

const MODEL_FALLBACK = Object.values(CycloneModelColor).filter(
  (color) => color !== CycloneModelColor.Slate &&
    color !== CycloneModelColor.Teal &&
    color !== CycloneModelColor.Fuchsia,
);

export function modelColor(model: string): string {
  if (isEnumValue(model, CycloneModelCode)) return MODEL_COLOR[model];
  let hash = CycloneColorHash.Seed;
  for (const character of model) {
    hash = (
      hash * CycloneColorHash.Multiplier +
      (character.codePointAt(CycloneColorHash.Seed) ?? CycloneColorHash.Seed)
    ) >>> CycloneColorHash.Seed;
  }
  return MODEL_FALLBACK[hash % MODEL_FALLBACK.length] ??
    CycloneModelColor.Violet;
}
