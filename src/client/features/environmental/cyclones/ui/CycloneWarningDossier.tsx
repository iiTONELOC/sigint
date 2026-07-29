import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { TriangleAlert } from "lucide-react";
import { CycloneWarningField, type CycloneWarningPoint } from "../types";
import { buildWarningDossierRows } from "../warningDetailRows";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

type Props = {
  readonly item: CycloneWarningPoint;
  readonly isolateMode: SelectedIsolateMode;
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
  const headline = w[CycloneWarningField.Headline];
  const rows = buildWarningDossierRows(w);

  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={TriangleAlert}
        title={w[CycloneWarningField.Alert]}
        subtitle={w.kind.toUpperCase()}
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
          {headline && (
            <Section title="DETAILS">
              <p className="text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap">
                {headline}
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
