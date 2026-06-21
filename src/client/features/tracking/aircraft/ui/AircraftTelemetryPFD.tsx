import { Tape } from "./instruments/Tape";
import { HeadingHSI } from "./instruments/HeadingHSI";
import { VerticalSpeed } from "./instruments/VerticalSpeed";
import { isaTempC } from "@/lib/units";
import { Card, Field } from "./dossierKit";

function Corner({
  pos,
  label,
  value,
}: {
  readonly pos: string;
  readonly label: string;
  readonly value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className={`absolute ${pos} font-mono leading-none whitespace-nowrap text-[clamp(7px,0.62vw,10px)]`}>
      <span className="text-sig-dim">{label} </span>
      <span className="text-sig-bright">{value}</span>
    </div>
  );
}

type Props = {
  readonly speed: number;
  readonly speedFooter: string;
  readonly heading: number;
  readonly selectedHeading?: number;
  readonly altitude: number;
  readonly selectedAlt?: number;
  readonly onGround?: boolean;
  readonly fpm: number;
  readonly squawk?: string;
  readonly emergency: boolean;
  readonly windDir?: number;
  readonly windSpd?: number;
  readonly oat?: number;
  readonly navQnh?: number;
  readonly navModes?: readonly string[];
  readonly windCompText?: string | null;
  readonly isaText?: string | null;
  readonly tatText?: string | null;
  readonly rssiText?: string | null;
  readonly accText?: string | null;
  readonly sourceText?: string | null;
};

export function AircraftTelemetryPFD({
  speed,
  speedFooter,
  heading,
  selectedHeading,
  altitude,
  selectedAlt,
  onGround,
  fpm,
  squawk,
  emergency,
  windDir,
  windSpd,
  oat,
  navQnh,
  navModes,
  windCompText,
  isaText,
  tatText,
  rssiText,
  accText,
  sourceText,
}: Props) {
  const wind =
    windDir != null && windSpd != null ? `${Math.round(windDir)}° / ${Math.round(windSpd)} kt` : null;
  const modes = navModes && navModes.length > 0 ? navModes.join(" · ").toUpperCase() : null;
  const oatVal = oat ?? (altitude > 0 ? isaTempC(altitude) : null);
  const oatText = oatVal != null ? `${oat == null ? "~" : ""}${Math.round(oatVal)}°C` : null;
  const qnhText = navQnh != null ? `${Math.round(navQnh)} hPa` : null;

  const stats: { label: string; value: string }[] = [];
  if (wind) stats.push({ label: "WIND", value: wind });
  if (windCompText) stats.push({ label: "W-COMP", value: windCompText });
  if (oatText) stats.push({ label: "OAT", value: oatText });
  if (isaText) stats.push({ label: "ISA DEV", value: isaText });
  if (tatText) stats.push({ label: "TAT", value: tatText });
  if (qnhText) stats.push({ label: "QNH", value: qnhText });
  if (modes) stats.push({ label: "AUTOPILOT", value: modes });
  const statRows = Array.from({ length: Math.ceil(stats.length / 2) }, (_, i) =>
    stats.slice(i * 2, i * 2 + 2),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 w-full max-w-md mx-auto overflow-hidden h-44">
        <div className="w-14 shrink-0">
          <Tape
            value={speed}
            step={10}
            labelEvery={20}
            pxPer={1.6}
            side="right"
            header="KT"
            footer={speedFooter}
            format={String}
          />
        </div>
        <div className="relative flex-1 min-w-28">
          <HeadingHSI heading={heading} selectedHeading={selectedHeading} />
          <Corner pos="top-0 left-0" label="SRC" value={sourceText} />
          <Corner pos="bottom-0 left-0" label="SIG" value={rssiText} />
          <Corner pos="bottom-0 right-0" label="ACC" value={accText} />
        </div>
        <div className="w-14 shrink-0">
          <Tape
            value={altitude}
            step={100}
            labelEvery={500}
            pxPer={0.12}
            side="left"
            header="FT"
            footer="x1000"
            selected={selectedAlt}
            format={(v) => (v / 1000).toFixed(1)}
          />
        </div>
        <div className="w-14 shrink-0">
          <VerticalSpeed fpm={fpm} />
        </div>
      </div>

      <Card className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <Field label="STATE" value={onGround ? "ON GROUND" : "AIRBORNE"} />
          {squawk && (
            <Field
              label="SQUAWK"
              value={squawk}
              align="right"
              valueClass={emergency ? "text-sig-danger" : ""}
            />
          )}
        </div>
        {statRows.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-sig-border/50">
            {statRows.map(([a, b]) => (
              <div key={a.label} className="flex justify-between gap-4">
                <Field label={a.label} value={a.value} />
                {b && <Field label={b.label} value={b.value} align="right" />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
