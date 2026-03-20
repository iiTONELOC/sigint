import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NewsFeedSkeleton } from "./NewsFeedSkeleton";

const NewsFeedPaneLazy = lazy(() =>
  import("./NewsFeedPane").then((m) => ({ default: m.NewsFeedPane })),
);

export function NewsFeed() {
  return (
    <ErrorBoundary name="news-feed">
      <Suspense fallback={<NewsFeedSkeleton />}>
        <NewsFeedPaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
