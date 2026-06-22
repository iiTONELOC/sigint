import { MMI_SCALE, mmiBand } from "../intensity";

const ORDER = [...MMI_SCALE].reverse();

export function MmiColumn({ mmi }: { readonly mmi: number }) {
  const band = mmiBand(mmi);
  const activeIdx = ORDER.indexOf(band);

  const markPct = ((activeIdx + 0.5) / ORDER.length) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="flex h-3 w-full rounded-[3px] overflow-hidden">
          {ORDER.map((b) => (
            <div key={b.level} className="flex-1" style={{ background: b.color }} />
          ))}
        </div>
        <div
          className="absolute -top-1 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-sig-bright"
          style={{ left: `${markPct}%` }}
        />
      </div>
      <div className="flex w-full">
        {ORDER.map((b, i) => (
          <span
            key={b.level}
            className={`flex-1 text-center font-mono leading-none ${
              i === activeIdx ? "font-bold" : "text-sig-dim"
            }`}
            style={i === activeIdx ? { color: band.ink, fontSize: "9px" } : { fontSize: "9px" }}
          >
            {b.roman}
          </span>
        ))}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-(length:--sig-text-md) font-bold leading-none shrink-0" style={{ color: band.ink }}>
          {band.roman}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-bright tracking-wide shrink-0">{band.label}</span>
        <span className="text-(length:--sig-text-xs) text-sig-dim truncate">· {band.damage}</span>
      </div>
    </div>
  );
}
