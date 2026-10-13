import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import { DomEvent, DomKey } from "@/runtime";

export enum MobileSheetClassName {
  Backdrop = "absolute inset-0 w-full h-full bg-black/60 cursor-default",
  Close = "touch-target flex items-center justify-center rounded text-sig-dim hover:text-sig-bright",
  Dialog = "relative m-0 w-full max-w-none border-0 border-t border-sig-border rounded-t-2xl bg-sig-panel text-inherit px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-3",
  Label = "text-(length:--sig-text-xs) font-semibold tracking-widest text-sig-dim",
  Row = "flex items-center justify-between",
  Shell = "fixed inset-0 z-(--layer-modal) flex flex-col justify-end",
}

const MOBILE_SHEET_BACKDROP_TAB_INDEX = -1;

type MobileSheetProps = Readonly<{
  children: ReactNode;
  closeLabel: string;
  label: string;
  onClose: () => void;
}>;

export function MobileSheet({
  children,
  closeLabel,
  label,
  onClose,
}: MobileSheetProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === DomKey.Escape) onClose();
    };
    document.addEventListener(DomEvent.KeyDown, closeOnEscape);
    return () => document.removeEventListener(DomEvent.KeyDown, closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className={MobileSheetClassName.Shell}>
      <button
        type={ButtonType.Button}
        aria-label={closeLabel}
        tabIndex={MOBILE_SHEET_BACKDROP_TAB_INDEX}
        onClick={onClose}
        className={MobileSheetClassName.Backdrop}
      />
      <dialog
        open
        aria-modal="true"
        aria-label={label}
        data-wt-menu=""
        className={MobileSheetClassName.Dialog}
      >
        <div className={MobileSheetClassName.Row}>
          <span className={MobileSheetClassName.Label}>{label}</span>
          <button
            type={ButtonType.Button}
            onClick={onClose}
            aria-label={closeLabel}
            className={MobileSheetClassName.Close}
          >
            <X size="1em" aria-hidden />
          </button>
        </div>
        {children}
      </dialog>
    </div>,
    document.body,
  );
}
