import { Newspaper } from "lucide-react";

export enum IntelFeedSkeletonCopy {
  Loading = "Loading intel feed",
}

enum IntelFeedSkeletonCard {
  First = "intel-card-first",
  Second = "intel-card-second",
  Third = "intel-card-third",
  Fourth = "intel-card-fourth",
  Fifth = "intel-card-fifth",
}

export function IntelFeedSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={IntelFeedSkeletonCopy.Loading}
      className="w-full h-full flex flex-col animate-pulse"
    >
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Newspaper aria-hidden className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
      </div>
      <div className="flex-1 p-2 space-y-2">
        {Object.values(IntelFeedSkeletonCard).map((card) => (
          <div
            key={card}
            className="p-2 rounded border border-sig-border/20 space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-8 bg-sig-dim/15 rounded" />
              <div className="h-3 w-40 bg-sig-dim/10 rounded" />
            </div>
            <div className="h-3 w-full bg-sig-dim/8 rounded" />
            <div className="h-3 w-2/3 bg-sig-dim/8 rounded" />
          </div>
        ))}
      </div>
    </output>
  );
}
