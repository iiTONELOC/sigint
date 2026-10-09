import { Plane, Ship, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { AreaKind } from "@shared/domain/cyclones";
import type { ConeAssets } from "../hooks/useAssetsInCone";

function AssetCard({
  icon: Icon,
  count,
  label,
  iconClass,
}: {
  readonly icon: typeof Plane;
  readonly count: number;
  readonly label: string;
  readonly iconClass: string;
}) {
  return (
    <div className="flex-1 flex items-center gap-2 min-w-max bg-sig-panel border border-sig-border rounded-[10px] px-2.5 py-1.5">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <span className="text-(length:--sig-text-md) text-sig-bright font-mono font-bold">{count}</span>
      <span className="text-(length:--sig-text-xs) tracking-widest text-sig-dim truncate">{label}</span>
    </div>
  );
}

function AssetPair({ children }: { readonly children: ReactNode }) {
  return <div className="flex-auto flex flex-wrap gap-2">{children}</div>;
}

export function CycloneAssets({ assets }: { readonly assets: ConeAssets | null }) {
  if (!assets || (assets.aircraft.length === 0 && assets.ships.length === 0 && assets.warnings.length === 0)) {
    return null;
  }
  const warningCount = assets.warnings.filter((warning) => warning.data.kind === AreaKind.Warning).length;
  return (
    <div className="flex-1 flex flex-wrap gap-2">
      <AssetPair>
        <AssetCard icon={Plane} count={assets.aircraft.length} label="AIRCRAFT" iconClass="text-sig-aircraft" />
        <AssetCard icon={Ship} count={assets.ships.length} label="SHIPS" iconClass="text-sig-ships" />
      </AssetPair>
      <AssetPair>
        <AssetCard icon={TriangleAlert} count={warningCount} label="WARNINGS" iconClass="text-sig-cycWarning" />
        <AssetCard icon={TriangleAlert} count={assets.warnings.length - warningCount} label="WATCHES" iconClass="text-sig-cycWatch" />
      </AssetPair>
    </div>
  );
}
