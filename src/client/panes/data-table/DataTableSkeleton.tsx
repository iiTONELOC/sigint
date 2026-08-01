import { Table2 } from "lucide-react";

enum DataTableSkeletonClass {
  Fill = "flex-1",
}

export enum DataTableSkeletonCopy {
  Loading = "Loading data table",
}

enum DataTableSkeletonRow {
  First = "data-row-first",
  Second = "data-row-second",
  Third = "data-row-third",
  Fourth = "data-row-fourth",
  Fifth = "data-row-fifth",
  Sixth = "data-row-sixth",
  Seventh = "data-row-seventh",
  Eighth = "data-row-eighth",
  Ninth = "data-row-ninth",
  Tenth = "data-row-tenth",
  Eleventh = "data-row-eleventh",
  Twelfth = "data-row-twelfth",
}

export function DataTableSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={DataTableSkeletonCopy.Loading}
      className="w-full h-full flex flex-col animate-pulse"
    >
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Table2 aria-hidden className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className={DataTableSkeletonClass.Fill} />
        <div className="h-3 w-16 bg-sig-dim/10 rounded" />
      </div>
      <div className={`${DataTableSkeletonClass.Fill} p-2 space-y-1`}>
        {Object.values(DataTableSkeletonRow).map((row) => (
          <div key={row} className="flex items-center gap-2 py-1">
            <div className="h-3 w-8 bg-sig-dim/10 rounded" />
            <div className="h-3 w-24 bg-sig-dim/8 rounded" />
            <div className="h-3 w-16 bg-sig-dim/8 rounded" />
            <div className={DataTableSkeletonClass.Fill} />
            <div className="h-3 w-12 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </output>
  );
}
