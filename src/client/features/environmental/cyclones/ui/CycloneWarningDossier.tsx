import { TriangleAlert } from "lucide-react";
import {
  CycloneWarningField,
} from "@shared/domain/cyclones";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { buildWarningDossierRows } from "../warningDetailRows";
import {
  DossierRow,
  DossierSection,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";

type Props = FeatureDossierProps<Domain.CyclonesWarning>;

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
          <DossierSection title="ALERT">
            {rows.map(([k, v]) => (
              <DossierRow key={k} label={k} value={v} />
            ))}
          </DossierSection>
          {headline && (
            <DossierSection title="DETAILS">
              <p className="text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap">
                {headline}
              </p>
            </DossierSection>
          )}
        </div>
      </div>
    </div>
  );
}
