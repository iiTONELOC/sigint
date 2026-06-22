import { Plane, Ship } from "lucide-react";
import type { ConeAssets } from "../hooks/useAssetsInCone";

// ASSETS IN CONE — aircraft + ship counts currently inside the official cone
// (cross-source: our own tracked tracks ∩ the NHC threat area). Two count cards.

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
    <div className="flex items-center gap-3 bg-sig-panel border border-sig-border rounded-[12px] px-3 py-3">
      <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-(length:--sig-text-title) text-sig-bright font-bold leading-none">
          {count}
        </div>
        <div className="text-(length:--sig-text-xs) tracking-widest text-sig-dim mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}

export function CycloneAssets({ assets }: { readonly assets: ConeAssets | null }) {
  if (!assets || (assets.aircraft.length === 0 && assets.ships.length === 0)) {
    return null;
  }
  return (
    <div className="@container/assets grid grid-cols-1 @min-[14rem]/assets:grid-cols-2 gap-2.5">
      <AssetCard icon={Plane} count={assets.aircraft.length} label="AIRCRAFT" iconClass="text-sig-aircraft" />
      <AssetCard icon={Ship} count={assets.ships.length} label="SHIPS" iconClass="text-sig-ships" />
    </div>
  );
}
