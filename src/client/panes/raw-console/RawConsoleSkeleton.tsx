import { Terminal } from "lucide-react";

export enum RawConsoleSkeletonCopy {
  Loading = "Loading console",
}

enum RawConsoleSkeletonLineWidth {
  Minimal = "w-[40%]",
  Compact = "w-[44%]",
  Short = "w-[48%]",
  Reduced = "w-[52%]",
  Moderate = "w-[56%]",
  Balanced = "w-[60%]",
  Extended = "w-[64%]",
  Broad = "w-[68%]",
  Wide = "w-[72%]",
  Wider = "w-[76%]",
  Long = "w-[80%]",
  Longer = "w-[84%]",
  Expansive = "w-[88%]",
  NearFull = "w-[92%]",
  Maximum = "w-[95%]",
}

export function RawConsoleSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={RawConsoleSkeletonCopy.Loading}
      className="w-full h-full flex flex-col animate-pulse"
    >
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
        <Terminal aria-hidden className="w-3 h-3 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="h-5 w-14 bg-sig-dim/10 rounded" />
      </div>
      <div className="flex-1 p-2 space-y-1">
        {Object.values(RawConsoleSkeletonLineWidth).map((width) => (
          <div
            key={width}
            className={`h-3 bg-sig-dim/8 rounded ${width}`}
          />
        ))}
      </div>
    </output>
  );
}
