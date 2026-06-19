import { useEffect, useId, useRef } from "react";
import { airportCode } from "./dossierTypes";

const HEADING_ACCENT = "var(--dossier-accent, var(--sigint-warn))";
import {
  MapPin,
  ExternalLink,
  Eye,
  Crosshair,
  LocateFixed,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ── IsoBtn ─────────────────────────────────────────────────────────
// Compact action button used in the dossier toolbar (LOCATE / FOCUS /
// SOLO). When `toggle` is set, the button is treated as a toggle and
// emits aria-pressed for the active state.

export function IsoBtn({
  active,
  label,
  icon: Icon,
  onClick,
  ariaLabel,
  toggle = false,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
  /** Accessible name. Falls back to `label`. */
  readonly ariaLabel?: string;
  /** Marks the button as a toggle, emitting aria-pressed. */
  readonly toggle?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={toggle ? active : undefined}
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors border shrink-0 ${
        active
          ? "text-sig-accent bg-sig-accent/15 border-sig-accent/40"
          : "text-sig-bright bg-transparent border-sig-border hover:text-sig-bright hover:border-sig-grid/40"
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label}
    </button>
  );
}

// ── Section ────────────────────────────────────────────────────────
// Semantic landmark + heading (WCAG 2.2 AA — Hard Rule 15). Each
// section gets a unique id linking <section aria-labelledby> to its
// <h3>. Visual styling unchanged — only the underlying tags shift
// from <div> to <section>/<h3>.

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-sm tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5 font-mono font-semibold"
        style={{ color: HEADING_ACCENT }}
      >
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

// ── CollapsibleSection ───────────────────────────────────────────────
// Same amber header treatment as Section, but built on native
// <details>/<summary> so it's keyboard- and screen-reader-accessible with
// no JS state. The chevron rotates open. `defaultOpen` controls the initial
// state — key data stays open, heavy text (advisory/discussion) collapses.

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary
        className="flex items-center gap-1 cursor-pointer list-none select-none text-sm tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5 font-mono font-semibold min-h-7"
        style={{ color: HEADING_ACCENT }}
      >
        <ChevronRight
          className="w-3 h-3 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {title}
      </summary>
      <div className="space-y-0.5 pt-1">{children}</div>
    </details>
  );
}

// ── Row ────────────────────────────────────────────────────────────

export function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  if (!value || value === "UNKNOWN" || value === "Unknown") return null;
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="text-sig-accent shrink-0">{label}</span>
      <span className="text-sig-bright text-right truncate font-mono">
        {value}
      </span>
    </div>
  );
}

export function RouteAirport({
  apt,
}: {
  readonly apt: { iata?: string; icao?: string; name?: string };
}) {
  const code = airportCode(apt) || "???";
  return (
    <div className="flex items-center gap-1">
      <MapPin className="w-3 h-3 text-sig-dim" aria-hidden="true" />
      <span className="font-mono text-sig-bright">{code}</span>
    </div>
  );
}

export function formatEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export function LinkRow({
  label,
  href,
}: {
  readonly label: string;
  readonly href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between text-sm text-sig-accent hover:text-sig-bright transition-colors py-0.5"
    >
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

// ── DossierToolbar ────────────────────────────────────────────────
// Unified toolbar — was duplicated across DossierPane (aircraft) and
// every NonAircraftDossier branch. Composed via icon/title/subtitle/
// badge slots. Close button gets an explicit aria-label; FOCUS/SOLO
// are aria-pressed toggle buttons; LOCATE is a one-shot action.

type DossierToolbarProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly subtitle?: string;
  /** Optional badge — e.g. "CAT 5" for cyclones, "MIL" for aircraft. */
  readonly badge?: React.ReactNode;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
  /** Optional ref forwarded to the close button — see useDossierFocus. */
  readonly closeButtonRef?: React.Ref<HTMLButtonElement>;
};

export function DossierToolbar({
  icon: Icon,
  title,
  subtitle,
  badge,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
}: DossierToolbarProps) {
  return (
    <div className="p-3 pb-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-sig-accent shrink-0" aria-hidden="true" />
        <span className="text-sig-bright font-mono tracking-wider text-base truncate flex-1">
          {title}
        </span>
        {badge != null && badge !== false && (
          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bright/20 text-sig-bright border border-sig-bright/40 shrink-0">
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <div className="text-xs text-sig-text mt-0.5 truncate font-mono">
          {subtitle}
        </div>
      )}
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <IsoBtn
          active={false}
          label="LOCATE"
          icon={LocateFixed}
          ariaLabel="Locate on globe"
          onClick={onLocate}
        />
        <IsoBtn
          active={isolateMode === "focus"}
          label="FOCUS"
          icon={Eye}
          toggle
          ariaLabel="Focus this layer"
          onClick={onFocus}
        />
        <IsoBtn
          active={isolateMode === "solo"}
          label="SOLO"
          icon={Crosshair}
          toggle
          ariaLabel="Solo this point"
          onClick={onSolo}
        />
      </div>
    </div>
  );
}

// ── useDossierFocus ────────────────────────────────────────────────
// Focus management for the dossier (WCAG 2.2 AA — Hard Rule 15). When
// the dossier opens (selection changes), focus moves to the close
// button so keyboard + screen-reader users land in a predictable spot.
// When the dossier closes (selection cleared), focus returns to the
// element that triggered selection, if it's still in the DOM.
//
// Returns a ref to attach to the close button via DossierToolbar's
// closeButtonRef prop.

export function useDossierFocus(
  selectionKey: string | null,
): React.RefObject<HTMLButtonElement | null> {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (selectionKey) {
      previousFocusRef.current ??= document.activeElement;
      closeBtnRef.current?.focus();
      return;
    }
    const prev = previousFocusRef.current;
    previousFocusRef.current = null;
    if (prev instanceof HTMLElement && document.contains(prev)) {
      prev.focus();
    }
  }, [selectionKey]);

  return closeBtnRef;
}

// ── MMSI country code (verbatim — used by ShipDossier) ─────────────

export function mmsiCountry(mmsi: number): string | null {
  const mid = Math.floor(mmsi / 1_000_000);
  const m: Record<number, string> = {
    201: "AL", 202: "AD", 203: "AT", 204: "PT", 205: "BE", 206: "BY",
    207: "BG", 209: "CY", 210: "CY", 211: "DE", 212: "CY", 213: "GE",
    214: "MD", 215: "MT", 216: "AM", 218: "DE", 219: "DK", 220: "DK",
    224: "ES", 225: "ES", 226: "FR", 227: "FR", 228: "FR", 229: "MT",
    230: "FI", 231: "FO", 232: "GB", 233: "GB", 234: "GB", 235: "GB",
    236: "GI", 237: "GR", 238: "HR", 239: "GR", 240: "GR", 241: "GR",
    242: "MA", 243: "HU", 244: "NL", 245: "NL", 246: "NL", 247: "IT",
    248: "MT", 249: "MT", 250: "IE", 251: "IS", 253: "LU", 255: "PT",
    256: "MT", 257: "NO", 258: "NO", 259: "NO", 261: "PL", 263: "PT",
    264: "RO", 265: "SE", 266: "SE", 267: "SK", 269: "CH", 270: "CZ",
    271: "TR", 272: "UA", 273: "RU", 275: "LV", 276: "EE", 277: "LT",
    278: "SI", 279: "ME", 303: "US", 306: "CW", 307: "AW", 308: "BS",
    310: "BM", 312: "BZ", 314: "BB", 316: "CA", 319: "KY", 321: "CR",
    323: "CU", 325: "DM", 327: "DO", 330: "GD", 331: "GL", 332: "GT",
    334: "HN", 336: "HT", 338: "US", 339: "JM", 345: "MX", 350: "NI",
    351: "PA", 352: "PA", 353: "PA", 354: "PA", 355: "PA", 356: "PA",
    357: "PA", 358: "PR", 359: "SV", 362: "TT", 366: "US", 367: "US",
    368: "US", 369: "US", 370: "PA", 371: "PA", 372: "PA", 373: "PA",
    374: "PA", 401: "AF", 403: "SA", 405: "BD", 410: "BT", 412: "CN",
    413: "CN", 414: "CN", 416: "TW", 417: "LK", 419: "IN", 422: "IR",
    425: "IQ", 428: "IL", 431: "JP", 432: "JP", 436: "KZ", 438: "JO",
    440: "KR", 441: "KR", 447: "KW", 450: "LB", 457: "MN", 461: "OM",
    463: "PK", 466: "QA", 468: "SY", 470: "AE", 473: "YE", 475: "TH",
    477: "HK", 501: "AQ", 503: "AU", 506: "MM", 512: "NZ", 525: "ID",
    533: "MY", 538: "MH", 548: "PH", 553: "PG", 563: "SG", 564: "SG",
    565: "SG", 566: "SG", 574: "VN", 576: "VU", 601: "ZA", 603: "AO",
    605: "DZ", 622: "EG", 624: "ET", 626: "GA", 627: "GH", 634: "KE",
    636: "LR", 637: "LR", 657: "NG", 659: "NA", 672: "TN", 674: "TZ",
    675: "UG", 678: "ZM", 679: "ZW",
  };
  return m[mid] ?? null;
}
