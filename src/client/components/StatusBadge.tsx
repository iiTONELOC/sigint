import { RefreshCw, AlertTriangle, Satellite, Database } from "lucide-react";

export type SourceStatus = {
  id: string;
  label: string;
  status: "loading" | "live" | "cached" | "mock" | "error" | "empty" | "unavailable";
};

type StatusBadgeProps = {
  readonly dataSources: SourceStatus[];
  readonly activeCount: number;
};

export function StatusBadge({
  dataSources,
  activeCount,
}: Readonly<StatusBadgeProps>) {
  const liveSources = dataSources.filter(
    (s) => s.status === "live" || s.status === "cached",
  );
  const simulatedSources = dataSources.filter((s) => s.status === "mock");
  const loadingSources = dataSources.filter((s) => s.status === "loading");
  const errorSources = dataSources.filter((s) => s.status === "error");

  const isLoading = loadingSources.length > 0 && liveSources.length === 0;
  const allMock =
    simulatedSources.length === dataSources.length && dataSources.length > 0;
  const hasLive = liveSources.length > 0;
  const hasCached = dataSources.some((s) => s.status === "cached");

  const statusLine = () => {
    if (isLoading) {
      return (
        <>
          <RefreshCw size="1em" className="animate-spin" />
          UPDATING...
        </>
      );
    }
    if (allMock) {
      return (
        <>
          <AlertTriangle size="1em" />
          SIMULATED • NO LIVE FEED
        </>
      );
    }
    if (hasLive) {
      const liveLabels = liveSources.map((s) => s.label).join(" / ");
      const icon = hasCached ? (
        <Database size="1em" />
      ) : (
        <Satellite size="1em" />
      );
      return (
        <>
          {icon}
          LIVE DATA • {liveLabels}
        </>
      );
    }
    return (
      <>
        <RefreshCw size="1em" />
        CONNECTING...
      </>
    );
  };

  const simLine =
    simulatedSources.length > 0 && !allMock
      ? `SIMULATED: ${simulatedSources.map((s) => s.label).join(" / ")}`
      : allMock
        ? "ALL DATA SIMULATED"
        : null;

  const errLine =
    errorSources.length > 0
      ? `OFFLINE: ${errorSources.map((s) => s.label).join(" / ")}`
      : null;

  return (
    <div className="absolute right-2 md:right-3 bottom-2 md:bottom-3 z-10 text-right rounded px-1.5 md:px-2 py-1 text-sig-dim text-(length:--sig-text-sm) bg-sig-panel/60">
      <div className="hidden sm:flex items-center justify-end gap-1 text-(length:--sig-text-md)">
        {statusLine()}
      </div>
      <div className="mt-px text-sig-accent">{activeCount} ACTIVE TRACKS</div>
      {simLine && <div className="mt-px hidden sm:block">{simLine}</div>}
      {errLine && (
        <div className="mt-px hidden sm:block text-sig-danger">{errLine}</div>
      )}
    </div>
  );
}
