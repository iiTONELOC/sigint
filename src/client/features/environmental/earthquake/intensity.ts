export enum MmiBandId {
  Extreme = 10,
  Violent = 9,
  Severe = 8,
  VeryStrong = 7,
  Strong = 6,
  Moderate = 5,
  Light = 4,
  Weak = 3,
  NotFelt = 1,
}

export enum MmiCssColor {
  Accent = "var(--dossier-accent)",
  Intensity = "var(--intensity-color)",
}

enum MmiLevelBoundary {
  Minimum = 1,
  Maximum = 10,
}

enum MmiDepthBoundaryKilometers {
  Near = 10,
  ShallowMaximum = 70,
  Far = 700,
}

enum MmiEstimateFactor {
  Magnitude = 1.5,
  Attenuation = 1.8,
}

export type MmiBand = Readonly<{
  id: MmiBandId;
  level: number;
  roman: string;
  label: string;
  damage: string;
  className: string;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mmiBandDefinition(id: MmiBandId): MmiBand {
  switch (id) {
    case MmiBandId.Extreme:
      return {
        id,
        level: id,
        roman: "X+",
        label: "EXTREME",
        damage: "total destruction",
        className: "[--dossier-accent:#c01818] [--intensity-color:#9c1414]",
      };
    case MmiBandId.Violent:
      return {
        id,
        level: id,
        roman: "IX",
        label: "VIOLENT",
        damage: "heavy damage",
        className: "[--dossier-accent:#d42424] [--intensity-color:#e02b2b]",
      };
    case MmiBandId.Severe:
      return {
        id,
        level: id,
        roman: "VIII",
        label: "SEVERE",
        damage: "moderate-heavy damage",
        className: "[--dossier-accent:#e07000] [--intensity-color:#ff8c1a]",
      };
    case MmiBandId.VeryStrong:
      return {
        id,
        level: id,
        roman: "VII",
        label: "VERY STRONG",
        damage: "moderate damage",
        className: "[--dossier-accent:#c79400] [--intensity-color:#ffc400]",
      };
    case MmiBandId.Strong:
      return {
        id,
        level: id,
        roman: "VI",
        label: "STRONG",
        damage: "light damage",
        className: "[--dossier-accent:#b59700] [--intensity-color:#ffe000]",
      };
    case MmiBandId.Moderate:
      return {
        id,
        level: id,
        roman: "V",
        label: "MODERATE",
        damage: "felt by all",
        className: "[--dossier-accent:#3fa83f] [--intensity-color:#7ad27a]",
      };
    case MmiBandId.Light:
      return {
        id,
        level: id,
        roman: "IV",
        label: "LIGHT",
        damage: "felt indoors",
        className: "[--dossier-accent:#3592c0] [--intensity-color:#7fc6e6]",
      };
    case MmiBandId.Weak:
      return {
        id,
        level: id,
        roman: "II–III",
        label: "WEAK",
        damage: "felt by some",
        className: "[--dossier-accent:#6677b0] [--intensity-color:#8c9ecf]",
      };
    default:
      return {
        id: MmiBandId.NotFelt,
        level: MmiBandId.NotFelt,
        roman: "I",
        label: "NOT FELT",
        damage: "instrumental",
        className: "[--dossier-accent:#6b7a8d] [--intensity-color:#9aa7b8]",
      };
  }
}

export function mmiScale(): readonly MmiBand[] {
  return Object.values(MmiBandId)
    .filter((value): value is MmiBandId => typeof value === "number")
    .sort((left, right) => right - left)
    .map(mmiBandDefinition);
}

export function mmiBand(level: number): MmiBand {
  const rounded = clamp(
    Math.round(level),
    MmiLevelBoundary.Minimum,
    MmiLevelBoundary.Maximum,
  );
  return mmiScale().find((band) => rounded >= band.level) ??
    mmiBandDefinition(MmiBandId.NotFelt);
}

export function estimateMmi(
  magnitude: number,
  depthKilometers?: number,
): number {
  const depth = depthKilometers == null
    ? MmiDepthBoundaryKilometers.Near
    : clamp(
        depthKilometers,
        MmiDepthBoundaryKilometers.Near,
        MmiDepthBoundaryKilometers.Far,
      );
  const depthPenalty = MmiEstimateFactor.Attenuation *
    Math.log10(depth / MmiDepthBoundaryKilometers.Near);
  const estimate =
    MmiEstimateFactor.Magnitude * magnitude -
    MmiEstimateFactor.Attenuation -
    depthPenalty;
  return clamp(
    estimate,
    MmiLevelBoundary.Minimum,
    MmiLevelBoundary.Maximum,
  );
}

export function isShallow(depthKilometers?: number): boolean {
  return depthKilometers != null &&
    depthKilometers <= MmiDepthBoundaryKilometers.ShallowMaximum;
}
