import { Plane } from "lucide-react";

export function DossierSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="p-3 pb-0">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-sig-dim/30 shrink-0" />
          <div className="h-4 w-32 bg-sig-dim/10 rounded" />
          <div className="flex-1" />
          <div className="h-6 w-6 bg-sig-dim/10 rounded" />
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <div className="h-6 w-16 bg-sig-dim/10 rounded" />
          <div className="h-6 w-16 bg-sig-dim/10 rounded" />
          <div className="h-6 w-16 bg-sig-dim/10 rounded" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-3 space-y-3">
        <div className="h-36 bg-sig-dim/10 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 bg-sig-dim/15 rounded" />
            <div className="h-3 w-full bg-sig-dim/8 rounded" />
            <div className="h-3 w-3/4 bg-sig-dim/8 rounded" />
            <div className="h-3 w-1/2 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
