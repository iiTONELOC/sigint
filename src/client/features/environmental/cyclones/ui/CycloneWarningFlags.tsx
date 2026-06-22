import { TS_MIN_KT, HURRICANE_MIN_KT } from "../classification";

const FLAG_RED = "#d32f2f";
const FLAG_BLACK = "#111111";

type WarningLevel = "none" | "gale" | "storm" | "hurricane";

function warningLevel(maxWindKt: number, isHurricane: boolean): WarningLevel {
  if (maxWindKt >= HURRICANE_MIN_KT) return isHurricane ? "hurricane" : "storm";
  if (maxWindKt >= TS_MIN_KT) return "gale";
  return "none";
}

const LEVEL_LABEL: Record<Exclude<WarningLevel, "none">, string> = {
  gale: "GALE WARNING",
  storm: "STORM WARNING",
  hurricane: "HURRICANE WARNING",
};

function GalePennant() {
  return (
    <svg viewBox="0 0 20 24" className="h-4 w-3.5" role="presentation">
      <polygon points="2,1 18,12 2,23" fill={FLAG_RED} />
    </svg>
  );
}

function SquareFlag() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" role="presentation">
      <rect x="1" y="1" width="22" height="22" fill={FLAG_RED} />
      <rect x="8" y="8" width="8" height="8" fill={FLAG_BLACK} />
    </svg>
  );
}

export function CycloneWarningFlags({
  maxWindKt,
  isHurricane,
}: {
  readonly maxWindKt: number;
  readonly isHurricane: boolean;
}) {
  const level = warningLevel(maxWindKt, isHurricane);
  if (level === "none") return null;

  const flags =
    level === "gale"
      ? [<GalePennant key="g1" />, <GalePennant key="g2" />]
      : level === "storm"
        ? [<SquareFlag key="s1" />]
        : [<SquareFlag key="h1" />, <SquareFlag key="h2" />];

  return (
    <div
      className="flex flex-col items-center gap-0.5 shrink-0"
      aria-label={LEVEL_LABEL[level]}
      title={LEVEL_LABEL[level]}
    >
      {flags}
    </div>
  );
}
