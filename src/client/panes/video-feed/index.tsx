import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VideoFeedSkeleton } from "./VideoFeedSkeleton";

const VideoFeedPaneLazy = lazy(() =>
  import("./VideoFeedPane").then((m) => ({ default: m.VideoFeedPane })),
);

export function VideoFeed() {
  return (
    <ErrorBoundary name="video-feed">
      <Suspense fallback={<VideoFeedSkeleton />}>
        <VideoFeedPaneLazy />
      </Suspense>
    </ErrorBoundary>
  );
}
