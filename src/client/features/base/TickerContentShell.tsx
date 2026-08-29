type TickerContentShellProps = Readonly<{
  primary: string;
  secondary: string | null;
}>;

export function TickerContentShell({
  primary,
  secondary,
}: TickerContentShellProps) {
  return (
    <div className="leading-snug overflow-hidden">
      <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-text text-(length:--sig-text-lg)">
        {primary}
      </div>
      {secondary !== null && (
        <div className="text-ellipsis whitespace-nowrap overflow-hidden text-sig-dim text-(length:--sig-text-sm)">
          {secondary}
        </div>
      )}
    </div>
  );
}
