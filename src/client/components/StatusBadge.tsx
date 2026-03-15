import { RefreshCw, AlertTriangle, Satellite, Database } from "lucide-react";
import type { AircraftDataSource } from "@/features/aircraft";

type StatusBadgeProps = {
  readonly loading: boolean;
  readonly dataSource: AircraftDataSource;
  readonly activeCount: number;
};

export function StatusBadge({
  loading,
  dataSource,
  activeCount,
}: Readonly<StatusBadgeProps>) {
  const statusLine = () => {
    if (loading) {
      return (
        <>
          <RefreshCw size="1em" className="animate-spin" />
          UPDATING AIRCRAFT...
        </>
      );
    }
    switch (dataSource) {
      case "live":
        return (
          <>
            <Satellite size="1em" />
            LIVE DATA • AIRCRAFT
          </>
        );
      case "cached":
        return (
          <>
            <Database size="1em" />
            CACHED DATA • AIRCRAFT
          </>
        );
      case "mock":
        return (
          <>
            <AlertTriangle size="1em" />
            SIMULATED • NO LIVE FEED
          </>
        );
      default:
        return (
          <>
            <RefreshCw size="1em" />
            CONNECTING...
          </>
        );
    }
  };

  return (
    <div className="absolute right-2 md:right-3 bottom-2 md:bottom-3 z-10 text-right rounded px-1.5 md:px-2 py-1 text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/60">
      <div className="hidden sm:flex items-center justify-end gap-1 text-(length:--sig-text-md)">
        {statusLine()}
      </div>
      <div className="mt-px text-sig-accent">{activeCount} ACTIVE TRACKS</div>
      <div className="mt-px hidden sm:block">
        {dataSource === "mock"
          ? "ALL DATA SIMULATED"
          : "SIMULATED: SHIPS / EVENTS / QUAKES"}
      </div>
    </div>
  );
}
