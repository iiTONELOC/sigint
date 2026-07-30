import { TriangleAlert } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneWarning } from "../data/warnings";
import { buildWarningDetailRows } from "../data/warningPoint";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

// Read-only dossier for a clicked watch/warning area. The event + severity are
// the title/badge, so the detail rows drop those to avoid repeating them.

type Props = {
  readonly item: DataPoint & { type: "cyclones-warning"; data: CycloneWarning };
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function CycloneWarningDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const w = item.data;
  const closeBtnRef = useDossierFocus(item.id);
  const isWarn = w.kind === "warning";
  const rows = buildWarningDetailRows(w).filter(
    ([k]) => k !== "Alert" && k !== "Severity",
  );

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={TriangleAlert}
        title={w.event}
        subtitle={isWarn ? "WARNING" : "WATCH"}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <Section title="ALERT">
            {rows.map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </Section>
          {w.headline && (
            <Section title="DETAILS">
              <p className="text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap">
                {w.headline}
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
