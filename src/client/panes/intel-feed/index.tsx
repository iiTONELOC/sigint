import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IntelFeedSkeleton } from "./IntelFeedSkeleton";

const IntelFeedPaneLazy = lazy(() =>
  import("./IntelFeedPane").then((m) => ({ default: m.IntelFeedPane })),
);

export function IntelFeed() {
  return (
    <ErrorBoundary name="intel-feed">
      <Suspense fallback={<IntelFeedSkeleton />}>
        <IntelFeedPaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
