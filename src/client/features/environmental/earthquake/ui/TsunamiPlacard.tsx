import { TriangleAlert } from "lucide-react";
import { formatTime } from "@/time";
import {
  type TsunamiAlert,
  TsunamiLevel,
} from "@shared/domain/earthquakes";

const LEVEL_TONE: Readonly<Record<TsunamiLevel, string>> = {
  [TsunamiLevel.Warning]:
    "border-sig-danger/45 bg-sig-danger/8 text-sig-danger",
  [TsunamiLevel.Advisory]:
    "border-sig-fires/45 bg-sig-fires/8 text-sig-fires",
  [TsunamiLevel.Watch]: "border-sig-warn/45 bg-sig-warn/8 text-sig-warn",
};

export function TsunamiPlacard({ alert }: { readonly alert: TsunamiAlert }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 ${LEVEL_TONE[alert.level]}`}>
      <span className="flex items-center gap-2 text-(length:--sig-text-sm) font-semibold tracking-wide">
        <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        TSUNAMI {alert.level.toUpperCase()}
      </span>
      {alert.areaDesc && (
        <span className="text-(length:--sig-text-xs) text-sig-bright">{alert.areaDesc}</span>
      )}
      {alert.expires && (
        <span className="text-(length:--sig-text-xs) text-sig-dim">
          expires {formatTime(alert.expires)}
        </span>
      )}
    </div>
  );
}
