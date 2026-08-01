import { Bell } from "lucide-react";

enum AlertLogSkeletonClass {
  Fill = "flex-1",
}

export enum AlertLogSkeletonCopy {
  Loading = "Loading alerts",
}

enum AlertLogSkeletonRow {
  First = "alert-row-first",
  Second = "alert-row-second",
  Third = "alert-row-third",
  Fourth = "alert-row-fourth",
  Fifth = "alert-row-fifth",
  Sixth = "alert-row-sixth",
  Seventh = "alert-row-seventh",
  Eighth = "alert-row-eighth",
}

export function AlertLogSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={AlertLogSkeletonCopy.Loading}
      className="w-full h-full flex flex-col animate-pulse"
    >
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Bell aria-hidden className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-16 bg-sig-dim/10 rounded" />
        <div className={AlertLogSkeletonClass.Fill} />
        <div className="h-3 w-12 bg-sig-dim/10 rounded" />
      </div>
      <div className={`${AlertLogSkeletonClass.Fill} p-2 space-y-1`}>
        {Object.values(AlertLogSkeletonRow).map((row) => (
          <div
            key={row}
            className="flex items-center gap-2 py-1.5 border-l-2 border-sig-dim/15 pl-2"
          >
            <div className="h-5 w-5 bg-sig-dim/10 rounded" />
            <div className="h-3 w-6 bg-sig-dim/15 rounded" />
            <div className="h-3 w-32 bg-sig-dim/8 rounded" />
            <div className={AlertLogSkeletonClass.Fill} />
            <div className="h-3 w-10 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </output>
  );
}
