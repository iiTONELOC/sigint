import {
  useMemo,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { useData } from "@/context/DataContext";
import { Terminal, Copy, Check } from "lucide-react";

const JSON_PUNCTUATION_CLASS = "text-sig-dim";
const JSON_KEY_CLASS = "text-sig-accent";
const JSON_STRING_CLASS = "text-sig-bright";
const JSON_NULL_CLASS = "text-sig-dim italic";
const JSON_NUMBER_STYLE: CSSProperties = { color: "var(--sigint-fires)" };
const JSON_BOOLEAN_STYLE: CSSProperties = { color: "var(--sigint-warn)" };
const JSON_NULL_LITERAL = "null";

const STRING_SOURCE = String.raw`"(?:\\.|[^"\\])*"`;
const COLON_SOURCE = String.raw`\s*:`;
const NUMBER_SOURCE = String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`;
const LITERAL_SOURCE = String.raw`\b(?:true|false|null)\b`;

type JsonToken = Readonly<{
  text: string;
  className?: string;
  style?: CSSProperties;
}>;

type JsonLexer = Readonly<{
  string: RegExp;
  colon: RegExp;
  number: RegExp;
  literal: RegExp;
}>;

type JsonRead = Readonly<{ tokens: readonly JsonToken[]; next: number }>;

function createLexer(): JsonLexer {
  return {
    string: new RegExp(STRING_SOURCE, "y"),
    colon: new RegExp(COLON_SOURCE, "y"),
    number: new RegExp(NUMBER_SOURCE, "y"),
    literal: new RegExp(LITERAL_SOURCE, "y"),
  };
}

function literalToken(text: string): JsonToken {
  return text === JSON_NULL_LITERAL
    ? { text, className: JSON_NULL_CLASS }
    : { text, style: JSON_BOOLEAN_STYLE };
}

function readQuoted(
  lexer: JsonLexer,
  json: string,
  start: number,
): JsonRead | null {
  lexer.string.lastIndex = start;
  const quoted = lexer.string.exec(json);
  if (!quoted) return null;

  const afterString = lexer.string.lastIndex;
  lexer.colon.lastIndex = afterString;
  const colon = lexer.colon.exec(json);
  if (!colon) {
    return {
      tokens: [{ text: quoted[0], className: JSON_STRING_CLASS }],
      next: afterString,
    };
  }
  return {
    tokens: [
      { text: quoted[0], className: JSON_KEY_CLASS },
      { text: colon[0], className: JSON_PUNCTUATION_CLASS },
    ],
    next: lexer.colon.lastIndex,
  };
}

function readToken(
  lexer: JsonLexer,
  json: string,
  start: number,
): JsonRead | null {
  const quoted = readQuoted(lexer, json, start);
  if (quoted) return quoted;

  lexer.number.lastIndex = start;
  const numeric = lexer.number.exec(json);
  if (numeric) {
    return {
      tokens: [{ text: numeric[0], style: JSON_NUMBER_STYLE }],
      next: lexer.number.lastIndex,
    };
  }

  lexer.literal.lastIndex = start;
  const literal = lexer.literal.exec(json);
  if (literal) {
    return { tokens: [literalToken(literal[0])], next: lexer.literal.lastIndex };
  }
  return null;
}

function tokenizeJson(json: string): JsonToken[] {
  const lexer = createLexer();
  const tokens: JsonToken[] = [];
  let punctuationStart = 0;
  let index = 0;

  while (index < json.length) {
    const read = readToken(lexer, json, index);
    if (!read) {
      index++;
      continue;
    }
    if (index > punctuationStart) {
      tokens.push({
        text: json.slice(punctuationStart, index),
        className: JSON_PUNCTUATION_CLASS,
      });
    }
    tokens.push(...read.tokens);
    index = read.next;
    punctuationStart = index;
  }

  if (json.length > punctuationStart) {
    tokens.push({
      text: json.slice(punctuationStart),
      className: JSON_PUNCTUATION_CLASS,
    });
  }
  return tokens;
}

function HighlightedJson({ json }: { readonly json: string }) {
  const tokens = useMemo(() => tokenizeJson(json), [json]);
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={`${index}-${token.text}`}
          className={token.className}
          style={token.style}
        >
          {token.text}
        </span>
      ))}
    </>
  );
}

// ── Component ───────────────────────────────────────────────────────

export function RawConsolePane() {
  const { selectedCurrent, counts, activeCount } = useData();
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

  const statsStr = useMemo(
    () =>
      JSON.stringify(
        {
          totalPoints: activeCount,
          byType: counts,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    [counts, activeCount],
  );

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
