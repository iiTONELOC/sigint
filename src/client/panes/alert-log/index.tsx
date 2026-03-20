import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AlertLogSkeleton } from "./AlertLogSkeleton";

const AlertLogPaneLazy = lazy(() =>
  import("./AlertLogPane").then((m) => ({ default: m.AlertLogPane })),
);

export function AlertLog() {
  return (
    <ErrorBoundary name="alert-log">
      <Suspense fallback={<AlertLogSkeleton />}>
        <AlertLogPaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
