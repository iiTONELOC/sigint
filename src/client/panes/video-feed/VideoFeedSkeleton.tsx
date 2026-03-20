import { Tv } from "lucide-react";

export function VideoFeedSkeleton() {
  return (
    <div className="w-full h-full flex flex-col animate-pulse">
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Tv className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="flex gap-1">
          <div className="h-5 w-5 bg-sig-dim/10 rounded" />
          <div className="h-5 w-5 bg-sig-dim/10 rounded" />
          <div className="h-5 w-5 bg-sig-dim/10 rounded" />
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 p-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-black/80 rounded flex items-center justify-center">
            <Tv className="w-6 h-6 text-sig-dim/15" />
          </div>
        ))}
      </div>
    </div>
  );
}
