import { useEffect, useRef, type ReactNode, type Ref } from "react";
import {
  Crosshair,
  Eye,
  LocateFixed,
  X,
  type LucideIcon,
} from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import {
  IsolateMode,
  type SelectedIsolateMode,
} from "@/workers/render/protocol";

export enum DossierToggleTone {
  Accent = "accent",
  DossierAccent = "dossier-accent",
}

type DossierToggleButtonProps = Readonly<{
  active: boolean;
  ariaLabel?: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  toggle?: boolean;
  tone?: DossierToggleTone;
}>;

function dossierToggleClassName(
  active: boolean,
  dossierTone: boolean,
): string {
  if (active) {
    return dossierTone
      ? "text-(--dossier-accent) bg-(--dossier-accent)/15 border-(--dossier-accent)/40"
      : "text-sig-accent bg-sig-accent/15 border-sig-accent/40";
  }
  return dossierTone
    ? "text-sig-dim bg-transparent border-sig-border hover:text-sig-bright hover:border-sig-grid/40"
    : "text-sig-bright bg-transparent border-sig-border hover:text-sig-bright hover:border-sig-grid/40";
}

export function DossierToggleButton({
  active,
  ariaLabel,
  icon: Icon,
  label,
  onClick,
  toggle = false,
  tone = DossierToggleTone.Accent,
}: DossierToggleButtonProps) {
  const dossierTone = tone === DossierToggleTone.DossierAccent;
  return (
    <button
      type={ButtonType.Button}
      aria-label={ariaLabel ?? label}
      aria-pressed={toggle ? active : undefined}
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors border shrink-0 ${dossierToggleClassName(active, dossierTone)}`}
    >
      <Icon className="w-3 h-3" aria-hidden />
      {label}
    </button>
  );
}

type DossierToolbarProps = Readonly<{
  badge?: ReactNode;
  closeButtonRef?: Ref<HTMLButtonElement>;
  icon: LucideIcon;
  isolateMode: SelectedIsolateMode;
  onClose: () => void;
  onFocus: () => void;
  onLocate: () => void;
  onSolo: () => void;
  subtitle?: string;
  title: string;
}>;

export function DossierToolbar({
  badge,
  closeButtonRef,
  icon: Icon,
  isolateMode,
  onClose,
  onFocus,
  onLocate,
  onSolo,
  subtitle,
  title,
}: DossierToolbarProps) {
  return (
    <div className="p-3 pb-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0 text-(--dossier-accent)" aria-hidden />
        <span className="text-sig-bright font-mono tracking-wider text-base truncate flex-1">
          {title}
        </span>
        {badge != null && badge !== false && (
          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bright/20 text-sig-bright border border-sig-bright/40 shrink-0">
            {badge}
          </span>
        )}
        <button
          ref={closeButtonRef}
          type={ButtonType.Button}
          aria-label="Close dossier"
          onClick={onClose}
          className="touch-target shrink-0 flex items-center justify-center rounded text-sig-text hover:text-sig-bright hover:bg-sig-bright/10 transition-colors"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      {subtitle && (
        <div className="text-xs text-sig-text mt-0.5 truncate font-mono">
          {subtitle}
        </div>
      )}
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <DossierToggleButton
          active={false}
          label="LOCATE"
          icon={LocateFixed}
          ariaLabel="Locate on globe"
          onClick={onLocate}
        />
        <DossierToggleButton
          active={isolateMode === IsolateMode.Focus}
          label="FOCUS"
          icon={Eye}
          toggle
          ariaLabel="Focus this layer"
          onClick={onFocus}
        />
        <DossierToggleButton
          active={isolateMode === IsolateMode.Solo}
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

export function useDossierFocus(
  selectionKey: string | null,
): React.RefObject<HTMLButtonElement | null> {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (selectionKey) {
      previousFocusRef.current ??= document.activeElement;
      closeButtonRef.current?.focus();
      return;
    }
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (
      previousFocus instanceof HTMLElement &&
      document.contains(previousFocus)
    ) {
      previousFocus.focus();
    }
  }, [selectionKey]);

  return closeButtonRef;
}

enum DossierIdentityClassName {
  FlexibleAge = "min-w-0",
  Shrink = "shrink-0",
  TruncatedSource = "min-w-0 truncate",
}

type DossierIdentityCardProps = Readonly<{
  age: string | null;
  children: ReactNode;
  source: ReactNode;
  truncateSource?: boolean;
}>;

export function DossierIdentityCard({
  age,
  children,
  source,
  truncateSource = false,
}: DossierIdentityCardProps) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-(--dossier-accent)/40 bg-sig-panel">
      <div className="absolute inset-0 bg-(--dossier-accent)/6 pointer-events-none" />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">{children}</div>
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span
          className={
            truncateSource
              ? `${DossierIdentityClassName.Shrink} ${DossierIdentityClassName.TruncatedSource}`
              : DossierIdentityClassName.Shrink
          }
        >
          SOURCE <span className="text-sig-text">{source}</span>
        </span>
        {age && (
          <span
            className={
              truncateSource
                ? DossierIdentityClassName.Shrink
                : DossierIdentityClassName.FlexibleAge
            }
          >
            {age}
          </span>
        )}
      </div>
    </div>
  );
}
