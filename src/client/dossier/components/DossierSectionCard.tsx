import type { ReactNode } from "react";

type DossierSectionCardProps = Readonly<{
  children: ReactNode;
}>;

export function DossierSectionCard({
  children,
}: DossierSectionCardProps) {
  return (
    <div className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
      {children}
    </div>
  );
}
