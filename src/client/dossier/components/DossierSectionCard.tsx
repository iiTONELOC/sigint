import { useId, type ReactNode } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

const DOSSIER_HEADING_ACCENT = "var(--dossier-accent, var(--sigint-warn))";

export function DossierCard(
  { children, className = "" }: Readonly<{ children: ReactNode; className?: string }>,
) {
  return (
    <div className={`bg-sig-panel border border-sig-border rounded-[12px] ${className}`}>
      {children}
    </div>
  );
}

export function DossierSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h3 className="text-(length:--sig-text-xs) font-semibold tracking-widest text-(--dossier-accent) mb-2">
      {children}
    </h3>
  );
}

export function DossierSectionCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
      {children}
    </div>
  );
}

export function DossierSection({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-sm tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5 font-mono font-semibold"
        style={{ color: DOSSIER_HEADING_ACCENT }}
      >
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function DossierCollapsibleSection({
  children,
  defaultOpen = true,
  title,
}: Readonly<{
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}>) {
  return (
    <details open={defaultOpen} className="group">
      <summary
        className="flex items-center gap-1 cursor-pointer list-none select-none text-sm tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5 font-mono font-semibold min-h-7"
        style={{ color: DOSSIER_HEADING_ACCENT }}
      >
        <ChevronRight
          className="w-3 h-3 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {title}
      </summary>
      <div className="space-y-0.5 pt-1">{children}</div>
    </details>
  );
}

export function DossierLinkRow({
  href,
  label,
}: Readonly<{ href: string; label: string }>) {
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

export type DossierLink = readonly [label: string, href: string];

export function DossierLinkGrid({
  links,
}: Readonly<{ links: readonly DossierLink[] }>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
      {links.map(([label, href]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 bg-sig-panel border border-sig-border rounded-lg px-2.5 py-2 text-(length:--sig-text-sm) text-sig-accent hover:border-sig-accent/40 transition-colors"
        >
          <span className="truncate">{label}</span>
          <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden={true} />
        </a>
      ))}
    </div>
  );
}
