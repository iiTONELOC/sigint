import { CycloneWindThreshold } from "../classification";

enum WarningFlagColor {
  Red = "#d32f2f",
  Black = "#111111",
}

enum WarningLevel {
  None = "none",
  Gale = "gale",
  Storm = "storm",
  Hurricane = "hurricane",
}

enum WarningLabel {
  GaleWarning = "GALE WARNING",
  StormWarning = "STORM WARNING",
  HurricaneWarning = "HURRICANE WARNING",
}

enum WarningFlagRole {
  Presentation = "presentation",
}

enum WarningFlagKey {
  GaleOne = "g1",
  GaleTwo = "g2",
  HurricaneOne = "h1",
  HurricaneTwo = "h2",
  StormOne = "s1",
}

function warningLevel(maxWindKt: number, isHurricane: boolean): WarningLevel {
  if (maxWindKt >= CycloneWindThreshold.HurricaneOne) {
    return isHurricane ? WarningLevel.Hurricane : WarningLevel.Storm;
  }
  if (maxWindKt >= CycloneWindThreshold.TropicalStorm) {
    return WarningLevel.Gale;
  }
  return WarningLevel.None;
}

function warningLabel(level: WarningLevel): WarningLabel {
  switch (level) {
    case WarningLevel.Gale:
      return WarningLabel.GaleWarning;
    case WarningLevel.Storm:
      return WarningLabel.StormWarning;
    default:
      return WarningLabel.HurricaneWarning;
  }
}

function GalePennant() {
  return (
    <svg viewBox="0 0 20 24" className="h-4 w-3.5" role={WarningFlagRole.Presentation}>
      <polygon points="2,1 18,12 2,23" fill={WarningFlagColor.Red} />
    </svg>
  );
}

function SquareFlag() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" role={WarningFlagRole.Presentation}>
      <rect x="1" y="1" width="22" height="22" fill={WarningFlagColor.Red} />
      <rect x="8" y="8" width="8" height="8" fill={WarningFlagColor.Black} />
    </svg>
  );
}

function warningFlags(level: WarningLevel) {
  switch (level) {
    case WarningLevel.Gale:
      return [
        <GalePennant key={WarningFlagKey.GaleOne} />,
        <GalePennant key={WarningFlagKey.GaleTwo} />,
      ];
    case WarningLevel.Storm:
      return [<SquareFlag key={WarningFlagKey.StormOne} />];
    default:
      return [
        <SquareFlag key={WarningFlagKey.HurricaneOne} />,
        <SquareFlag key={WarningFlagKey.HurricaneTwo} />,
      ];
  }
}

export function CycloneWarningFlags({
  maxWindKt,
  isHurricane,
}: {
  readonly maxWindKt: number;
  readonly isHurricane: boolean;
}) {
  const level = warningLevel(maxWindKt, isHurricane);
  if (level === WarningLevel.None) return null;

  const flags = warningFlags(level);
  const label = warningLabel(level);

  return (
    <div
      className="flex flex-col items-center gap-0.5 shrink-0"
      aria-label={label}
      title={label}
    >
      {flags}
    </div>
  );
}
