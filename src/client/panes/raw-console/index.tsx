import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RawConsoleSkeleton } from "./RawConsoleSkeleton";

const RawConsolePaneLazy = lazy(() =>
  import("./RawConsolePane").then((m) => ({ default: m.RawConsolePane })),
);

export function RawConsole() {
  return (
    <ErrorBoundary name="raw-console">
      <Suspense fallback={<RawConsoleSkeleton />}>
        <RawConsolePaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
