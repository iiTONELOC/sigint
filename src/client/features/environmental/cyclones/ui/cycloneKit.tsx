import { useId, type ReactNode } from "react";

// Shared card primitives for the cyclone dossier/detail. Tailwind only. The
// accent is always var(--dossier-accent), which CycloneDossier overrides with
// windColor(maxWindKt) so every box recolors by Saffir-Simpson category.

/** Section landmark + header — category-accented, token font (matches the app's
 *  dossier heading scale). Used instead of the shared Section so the cyclone
 *  dossier's typography is consistent end to end. */
export function CycSection({
  title,
  children,
  className = "",
  fill = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** When the section is `h-full flex flex-col`, let the content fill the cell
   *  so equal-height row-mates have flush bottoms. */
  readonly fill?: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      <h3
        id={headingId}
        className="text-(length:--sig-text-xs) font-semibold tracking-widest text-(--dossier-accent) mb-2"
      >
        {title}
      </h3>
      {fill ? <div className="flex-1 min-h-0 flex flex-col">{children}</div> : children}
    </section>
  );
}

export function StatBox({
  label,
  children,
  lead = false,
  className = "",
}: {
  readonly label: string;
  readonly children: ReactNode;
  /** Lead vital — gets the category-colored left border. */
  readonly lead?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={`bg-sig-panel border border-sig-border rounded-[10px] px-3 py-2.5 min-w-0 h-full flex flex-col ${
        lead ? "border-l-2 border-l-(--dossier-accent)" : ""
      } ${className}`}
    >
      <div className="text-(length:--sig-text-xs) tracking-widest text-sig-dim">
        {label}
      </div>
      {children}
    </div>
  );
}

export function StatValue({
  value,
  unit,
  className = "",
}: {
  readonly value: ReactNode;
  readonly unit?: string;
  readonly className?: string;
}) {
  return (
    <div className={`text-(length:--sig-text-cqtitle) text-sig-bright leading-none mt-1 ${className}`}>
      {value}
      {unit && <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">{unit}</span>}
    </div>
  );
}

/** Sub-line under a stat value. `tone` is SEMANTIC: a strengthening storm /
 *  deepening pressure is `bad` (red); weakening / filling is `good` (green). */
export function StatTrend({
  children,
  tone = "dim",
}: {
  readonly children: ReactNode;
  readonly tone?: "good" | "bad" | "dim";
}) {
  const color =
    tone === "bad"
      ? "text-sig-danger"
      : tone === "good"
        ? "text-sig-quakes"
        : "text-sig-text";
  return <div className={`text-(length:--sig-text-xs) mt-auto pt-1.5 ${color}`}>{children}</div>;
}
