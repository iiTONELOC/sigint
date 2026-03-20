import { Rss } from "lucide-react";

export function NewsFeedSkeleton() {
  return (
    <div className="w-full h-full flex flex-col animate-pulse">
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Rss className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="h-5 w-5 bg-sig-dim/10 rounded" />
      </div>
      <div className="shrink-0 flex gap-1 px-2 py-1 border-b border-sig-border/20">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-5 w-16 bg-sig-dim/10 rounded" />
        ))}
      </div>
      <div className="flex-1 p-2 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-full bg-sig-dim/10 rounded" />
            <div className="h-3 w-3/4 bg-sig-dim/8 rounded" />
            <div className="flex gap-2">
              <div className="h-2.5 w-16 bg-sig-dim/8 rounded" />
              <div className="h-2.5 w-20 bg-sig-dim/8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
