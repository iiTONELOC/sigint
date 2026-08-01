import { Plane } from "lucide-react";

export enum DossierSkeletonCopy {
  Loading = "Loading dossier",
}

enum DossierSkeletonSection {
  Upper = "dossier-section-upper",
  Middle = "dossier-section-middle",
  Lower = "dossier-section-lower",
}

enum DossierSkeletonTab {
  Left = "dossier-tab-left",
  Center = "dossier-tab-center",
  Right = "dossier-tab-right",
}

export function DossierSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={DossierSkeletonCopy.Loading}
      className="h-full flex flex-col animate-pulse"
    >
      <div className="p-3 pb-0">
        <div className="flex items-center gap-2">
          <Plane
            aria-hidden
            className="w-4 h-4 text-sig-dim/30 shrink-0"
          />
          <div className="h-4 w-32 bg-sig-dim/10 rounded" />
          <div className="flex-1" />
          <div className="h-6 w-6 bg-sig-dim/10 rounded" />
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          {Object.values(DossierSkeletonTab).map((tab) => (
            <div key={tab} className="h-6 w-16 bg-sig-dim/10 rounded" />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-3 space-y-3">
        <div className="h-36 bg-sig-dim/10 rounded" />
        {Object.values(DossierSkeletonSection).map((section) => (
          <div key={section} className="space-y-1.5">
            <div className="h-3 w-20 bg-sig-dim/15 rounded" />
            <div className="h-3 w-full bg-sig-dim/8 rounded" />
            <div className="h-3 w-3/4 bg-sig-dim/8 rounded" />
            <div className="h-3 w-1/2 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </output>
  );
}
