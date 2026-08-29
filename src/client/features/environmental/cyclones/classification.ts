import { ktToMph } from "@/measurements";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_HURRICANE_CATEGORIES_DESCENDING,
  CycloneModelCode,
  SaffirSimpson,
  cycloneCategoryShortLabel,
} from "@shared/domain/cyclones";
import { isEnumValue } from "@shared/types/enum";

enum CycloneBandIndex {
  First = 0,
  PreviousOffset = 1,
}

export const SAFFIR_SIMPSON: readonly {
  cat: SaffirSimpson;
  minKt: number;
  label: string;
  color: string;
}[] = CYCLONE_HURRICANE_CATEGORIES_DESCENDING.map((category) => {
  const {
    color,
    minimumWindKt: minKt,
    saffirSimpson: cat,
  } = CYCLONE_CATEGORY_METADATA[category];
  return { cat, minKt, label: cycloneCategoryShortLabel(category), color };
});

export function categoryShort(kt: number): string {
  for (const band of SAFFIR_SIMPSON) if (kt >= band.minKt) return band.label;
  const category = kt >= CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt
    ? Category.TropicalStorm
    : Category.TropicalDepression;
  return cycloneCategoryShortLabel(category);
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
    label: cycloneCategoryShortLabel(Category.TropicalStorm),
    color: CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].color,
    range: `${ktToMph(CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt)}-${ktToMph(
      CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt -
        CycloneBandIndex.PreviousOffset,
    )} mph`,
  },
];

export function windColor(kt: number): string {
  for (const b of SAFFIR_SIMPSON) if (kt >= b.minKt) return b.color;
  const category = kt >= CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt
    ? Category.TropicalStorm
    : Category.TropicalDepression;
  return CYCLONE_CATEGORY_METADATA[category].color;
}

export function windRadiiBandColor(thresholdKt: number): string {
  if (thresholdKt >= CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt) {
    return CYCLONE_CATEGORY_METADATA[Category.Hurricane4].color;
  }
  if (thresholdKt > CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt) {
    return CYCLONE_CATEGORY_METADATA[Category.Hurricane1].color;
  }
  return CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].color;
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

type CycloneModelMetadata = Readonly<{
  color: CycloneModelColor;
  label: string;
}>;

type CycloneModelFamilyMetadata = CycloneModelMetadata &
  Readonly<{ aliases: readonly CycloneModelCode[] }>;

const MODEL_FAMILY_BY_PRIMARY_CODE: Readonly<
  Partial<Record<CycloneModelCode, CycloneModelFamilyMetadata>>
> = {
  [CycloneModelCode.Official]: { aliases: [], color: CycloneModelColor.Violet, label: "NHC Official" },
  [CycloneModelCode.Consensus]: { aliases: [], color: CycloneModelColor.Fuchsia, label: "Consensus" },
  [CycloneModelCode.Gfs]: { aliases: [CycloneModelCode.GfsOperational], color: CycloneModelColor.Sky, label: "GFS" },
  [CycloneModelCode.Ecmwf]: { aliases: [CycloneModelCode.EcmwfOperational], color: CycloneModelColor.Rose, label: "ECMWF" },
  [CycloneModelCode.Canadian]: { aliases: [CycloneModelCode.CanadianInterpolated], color: CycloneModelColor.Green, label: "Canadian" },
  [CycloneModelCode.Ukmet]: { aliases: [CycloneModelCode.UkmetInterpolated], color: CycloneModelColor.Amber, label: "UKMET" },
  [CycloneModelCode.Hwrf]: { aliases: [CycloneModelCode.HwrfInterpolated], color: CycloneModelColor.Orange, label: "HWRF" },
  [CycloneModelCode.Hmon]: { aliases: [CycloneModelCode.HmonInterpolated], color: CycloneModelColor.Pink, label: "HMON" },
  [CycloneModelCode.Navy]: { aliases: [], color: CycloneModelColor.Teal, label: "Navy NAVGEM" },
  [CycloneModelCode.GefsMean]: { aliases: [], color: CycloneModelColor.Slate, label: "GEFS Mean" },
};

function buildModelMetadataByCode(): Readonly<
  Partial<Record<CycloneModelCode, CycloneModelMetadata>>
> {
  const metadataByCode: Partial<Record<CycloneModelCode, CycloneModelMetadata>> = {};
  for (const primaryCode of Object.keys(MODEL_FAMILY_BY_PRIMARY_CODE)) {
    if (!isEnumValue(primaryCode, CycloneModelCode)) continue;
    const family = MODEL_FAMILY_BY_PRIMARY_CODE[primaryCode];
    if (!family) continue;
    const metadata = { color: family.color, label: family.label };
    metadataByCode[primaryCode] = metadata;
    for (const alias of family.aliases) metadataByCode[alias] = metadata;
  }
  return metadataByCode;
}

const MODEL_METADATA_BY_CODE = buildModelMetadataByCode();

function knownModelMetadata(model: string): CycloneModelMetadata | undefined {
  return isEnumValue(model, CycloneModelCode)
    ? MODEL_METADATA_BY_CODE[model]
    : undefined;
}

const MODEL_FALLBACK = Object.values(CycloneModelColor).filter(
  (color) => color !== CycloneModelColor.Slate &&
    color !== CycloneModelColor.Teal &&
    color !== CycloneModelColor.Fuchsia,
);

export function modelColor(model: string): string {
  const metadata = knownModelMetadata(model);
  if (metadata) {
    return metadata.color;
  }
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

export function modelLabel(model: string): string {
  const metadata = knownModelMetadata(model);
  if (!metadata) return model;
  return metadata.label;
}
