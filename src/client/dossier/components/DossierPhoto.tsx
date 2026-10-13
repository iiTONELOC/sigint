import { Camera } from "lucide-react";
import type { ReactNode } from "react";

enum PhotoCreditText {
  Separator = "·",
}

export function CoverImage({
  alt,
  onError,
  src,
}: Readonly<{ alt: string; onError?: () => void; src: string }>) {
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={onError}
    />
  );
}

export function PhotoCredit({
  credit,
  license,
  prefix,
}: Readonly<{ credit: string; license?: string; prefix?: ReactNode }>) {
  return (
    <div className="absolute top-2 left-2 flex items-center gap-1 text-(length:--sig-text-xs) text-sig-bright/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
      <Camera className="w-3 h-3 shrink-0" aria-hidden />
      {prefix && <span className="shrink-0 font-bold tracking-wider">{prefix}</span>}
      <span className="truncate max-w-40">{credit}</span>
      {license && (
        <span className="shrink-0">
          {PhotoCreditText.Separator} {license}
        </span>
      )}
    </div>
  );
}
