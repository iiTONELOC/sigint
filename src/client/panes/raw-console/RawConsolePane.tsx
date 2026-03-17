import { useMemo } from "react";
import { useData } from "@/context/DataContext";
import { Terminal, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

export function RawConsolePane() {
  const { selectedCurrent, allData } = useData();
  const [copied, setCopied] = useState(false);

  const jsonStr = useMemo(() => {
    if (!selectedCurrent) return null;
    try {
      return JSON.stringify(selectedCurrent, null, 2);
    } catch {
      return "// Error serializing data";
    }
  }, [selectedCurrent]);

  const statsStr = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allData) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return JSON.stringify(
      {
        totalPoints: allData.length,
        byType: counts,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );
  }, [allData]);

  const handleCopy = useCallback(() => {
    const text = jsonStr ?? statsStr;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [jsonStr, statsStr]);

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
        <Terminal size={11} strokeWidth={2.5} className="text-sig-accent" />
        <span className="text-sig-accent text-(length:--sig-text-sm) tracking-wider font-semibold">
          {selectedCurrent ? "ENTITY DATA" : "SYSTEM STATUS"}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border/50 hover:text-sig-accent transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check size={10} strokeWidth={2.5} className="text-sig-accent" />
          ) : (
            <Copy size={10} strokeWidth={2.5} />
          )}
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto sigint-scroll p-2">
        {selectedCurrent ? (
          <div>
            <div className="text-sig-dim text-(length:--sig-text-sm) tracking-wider mb-1">
              // Selected: {selectedCurrent.type} — {selectedCurrent.id}
            </div>
            <pre className="text-sig-text text-(length:--sig-text-sm) font-mono whitespace-pre-wrap break-all leading-relaxed">
              {jsonStr}
            </pre>
          </div>
        ) : (
          <div>
            <div className="text-sig-dim text-(length:--sig-text-sm) tracking-wider mb-1">
              // No entity selected — showing system status
            </div>
            <pre className="text-sig-text text-(length:--sig-text-sm) font-mono whitespace-pre-wrap break-all leading-relaxed">
              {statsStr}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
