import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataTableSkeleton } from "./DataTableSkeleton";

const DataTablePaneLazy = lazy(() =>
  import("./DataTablePane").then((m) => ({ default: m.DataTablePane })),
);

export function DataTable() {
  return (
    <ErrorBoundary name="data-table">
      <Suspense fallback={<DataTableSkeleton />}>
        <DataTablePaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
