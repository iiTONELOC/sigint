import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DossierSkeleton } from "./DossierSkeleton";

const DossierPaneLazy = lazy(() =>
  import("./DossierPane").then((m) => ({ default: m.DossierPane })),
);

export function Dossier() {
  return (
    <ErrorBoundary name="dossier">
      <Suspense fallback={<DossierSkeleton />}>
        <DossierPaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
