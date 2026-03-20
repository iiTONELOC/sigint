import { Table2 } from "lucide-react";

export function DataTableSkeleton() {
  return (
    <div className="w-full h-full flex flex-col animate-pulse">
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Table2 className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="h-3 w-16 bg-sig-dim/10 rounded" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <div className="h-3 w-8 bg-sig-dim/10 rounded" />
            <div className="h-3 w-24 bg-sig-dim/8 rounded" />
            <div className="h-3 w-16 bg-sig-dim/8 rounded" />
            <div className="flex-1" />
            <div className="h-3 w-12 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
