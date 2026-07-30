import { useMemo, useState, useCallback, type JSX } from "react";
import { useData } from "@/context/DataContext";
import { Terminal, Copy, Check } from "lucide-react";

// ── JSON syntax highlighter ─────────────────────────────────────────
// Uses SIGINT theme CSS vars for consistent coloring across themes.
//
// Color mapping:
//   keys     → sig-accent  (cyan in dark, teal in light)
//   strings  → sig-bright  (white-ish)
//   numbers  → --sigint-fires via inline style (orange)
//   booleans → --sigint-warn via inline style  (yellow)
//   null     → sig-dim     (gray)
//   brackets → sig-dim     (gray)

function HighlightedJson({ json }: { readonly json: string }) {
  const parts = useMemo(() => {
    const result: JSX.Element[] = [];
    const regex =
      /("(?:\\.|[^"\\])*")\s*(:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = regex.exec(json)) !== null) {
      // Brackets, commas, whitespace before match
      if (match.index > lastIndex) {
        result.push(
          <span key={i++} className="text-sig-dim">
            {json.slice(lastIndex, match.index)}
          </span>,
        );
      }

      if (match[1] !== undefined) {
        if (match[2]) {
          // Key
          result.push(
            <span key={i++} className="text-sig-accent">
              {match[1]}
            </span>,
          );
          result.push(
            <span key={i++} className="text-sig-dim">
              {match[2]}
            </span>,
          );
        } else {
          // String value
          result.push(
            <span key={i++} className="text-sig-bright">
              {match[1]}
            </span>,
          );
        }
      } else if (match[3] !== undefined) {
        // Number — use fires color (orange)
        result.push(
          <span key={i++} style={{ color: "var(--sigint-fires)" }}>
            {match[3]}
          </span>,
        );
      } else if (match[4] !== undefined) {
        // Boolean — use warn color (yellow)
        result.push(
          <span key={i++} style={{ color: "var(--sigint-warn)" }}>
            {match[4]}
          </span>,
        );
      } else if (match[5] !== undefined) {
        // Null
        result.push(
          <span key={i++} className="text-sig-dim italic">
            {match[5]}
          </span>,
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Remaining
    if (lastIndex < json.length) {
      result.push(
        <span key={i++} className="text-sig-dim">
          {json.slice(lastIndex)}
        </span>,
      );
    }

    return result;
  }, [json]);

  return <>{parts}</>;
}

// ── Component ───────────────────────────────────────────────────────

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

  // Display version truncates long strings for readability
  const displayJsonStr = useMemo(() => {
    if (!selectedCurrent) return null;
    try {
      return JSON.stringify(
        selectedCurrent,
        (_key, value) => {
          if (typeof value === "string" && value.length > 64) {
            return value.slice(0, 61) + "...";
          }
          return value;
        },
        2,
      );
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

  const displayStr = displayJsonStr ?? statsStr;
  const copyStr = jsonStr ?? statsStr;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(copyStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [copyStr]);

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
        <div className="text-sig-dim text-(length:--sig-text-sm) tracking-wider mb-1">
          {selectedCurrent
            ? `// Selected: ${selectedCurrent.type} — ${selectedCurrent.id}`
            : "// No entity selected — showing system status"}
        </div>
        <pre className="text-(length:--sig-text-sm) font-mono whitespace-pre leading-relaxed overflow-x-auto">
          <HighlightedJson json={displayStr} />
        </pre>
      </div>
    </div>
  );
}
