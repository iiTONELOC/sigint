import { Terminal } from "lucide-react";

export function RawConsoleSkeleton() {
  return (
    <div className="w-full h-full flex flex-col animate-pulse">
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
        <Terminal className="w-3 h-3 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="h-5 w-14 bg-sig-dim/10 rounded" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {Array.from({ length: 15 }, (_, i) => (
          <div key={i} className="h-3 bg-sig-dim/8 rounded" style={{ width: `${40 + Math.random() * 55}%` }} />
        ))}
      </div>
    </div>
  );
}
