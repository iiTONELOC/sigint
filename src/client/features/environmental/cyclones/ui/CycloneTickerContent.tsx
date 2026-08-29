import { SaffirSimpson, type CycloneData } from "@shared/domain/cyclones";
import {
  TickerContentShell,
  type TickerRendererProps,
} from "@/features/base";
import { formatKtShort } from "@/measurements";

export function CycloneTickerContent({ data }: Readonly<TickerRendererProps>) {
  const d = data as CycloneData;
  const badge = d.saffirSimpson > SaffirSimpson.None
    ? `CAT ${d.saffirSimpson}`
    : d.classification;
  return (
    <TickerContentShell
      primary={d.name}
      secondary={`${badge} · ${formatKtShort(d.maxWindKt)}`}
    />
  );
}
