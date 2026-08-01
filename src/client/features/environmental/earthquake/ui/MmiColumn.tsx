import { mmiBand, mmiScale } from "../intensity";

enum MmiColumnClassName {
  ActiveLabel = "font-bold text-(--dossier-accent)",
  InactiveLabel = "text-sig-dim",
}

export function MmiColumn({ mmi }: { readonly mmi: number }) {
  const band = mmiBand(mmi);
  const order = [...mmiScale()].reverse();

  return (
    <div className={`${band.className} flex flex-col gap-2`}>
      <div className="relative">
        <div className="flex h-3 w-full rounded-[3px] overflow-hidden">
          {order.map((candidate) => (
            <div
              key={candidate.id}
              className={`${candidate.className} flex-1 bg-(--intensity-color)`}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 -top-1 flex">
          {order.map((candidate) => (
            <div key={candidate.id} className="relative flex-1 h-0">
              {candidate.id === band.id && (
                <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-sig-bright" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-full">
        {order.map((candidate) => {
          const active = candidate.id === band.id;
          return (
            <span
              key={candidate.id}
              className={`${candidate.className} flex-1 text-center text-[9px] font-mono leading-none ${active ? MmiColumnClassName.ActiveLabel : MmiColumnClassName.InactiveLabel}`}
            >
              {candidate.roman}
            </span>
          );
        })}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-(length:--sig-text-md) text-(--dossier-accent) font-bold leading-none shrink-0">
          {band.roman}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-bright tracking-wide shrink-0">
          {band.label}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-dim truncate">
          · {band.damage}
        </span>
      </div>
    </div>
  );
}
