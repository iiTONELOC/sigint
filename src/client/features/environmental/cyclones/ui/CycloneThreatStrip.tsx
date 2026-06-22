import { TriangleAlert } from "lucide-react";
import type { Landfall } from "../hooks/useLandfallEta";
import { landfallText } from "../hooks/useLandfallEta";

// Landfall threat strip. Danger-tinted when the storm is onshore or has a
// landfall ETA; dimmed when it stays offshore. Sits directly under the placard.

export function CycloneThreatStrip({ landfall }: { readonly landfall: Landfall | null }) {
  if (!landfall) return null;
  const lf = landfallText(landfall);
  const tone = lf.urgent
    ? "border-sig-danger/40 text-sig-danger bg-sig-danger/8"
    : "border-sig-border text-sig-dim";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-[10px] border px-3 py-2.5 ${tone}`}>
      <span className="flex items-center gap-2 text-(length:--sig-text-sm) tracking-wide shrink-0">
        <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        LANDFALL
      </span>
      <span className="text-(length:--sig-text-sm) font-semibold text-right min-w-0">{lf.text}</span>
    </div>
  );
}
