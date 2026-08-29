import { PanelSide } from "@/layout-mode/model/layoutMode";
import type { ReactNode } from "react";

enum DetailFieldClassName {
  Root = "min-w-0",
  RootRight = "min-w-0 text-right",
  Label = "text-(length:--sig-text-xs) tracking-wide text-sig-dim",
  Value = "text-(length:--sig-text-sm) text-sig-bright truncate",
}

type DetailFieldProps = Readonly<{
  label: string;
  value: ReactNode;
  align?: PanelSide;
  valueClass?: string;
}>;

export function DetailField({
  label,
  value,
  align = PanelSide.Left,
  valueClass = "",
}: DetailFieldProps) {
  return (
    <div
      className={
        align === PanelSide.Right
          ? DetailFieldClassName.RootRight
          : DetailFieldClassName.Root
      }
    >
      <div className={DetailFieldClassName.Label}>{label}</div>
      <div className={`${DetailFieldClassName.Value} ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
