import { Tv } from "lucide-react";

export enum VideoFeedSkeletonCopy {
  Loading = "Loading video feed",
}

enum VideoFeedSkeletonAction {
  Left = "video-action-left",
  Center = "video-action-center",
  Right = "video-action-right",
}

enum VideoFeedSkeletonSlot {
  UpperLeft = "video-slot-upper-left",
  UpperRight = "video-slot-upper-right",
  LowerLeft = "video-slot-lower-left",
  LowerRight = "video-slot-lower-right",
}

export function VideoFeedSkeleton() {
  return (
    <output
      aria-busy={true}
      aria-label={VideoFeedSkeletonCopy.Loading}
      className="w-full h-full flex flex-col animate-pulse"
    >
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-sig-border/40">
        <Tv aria-hidden className="w-3.5 h-3.5 text-sig-dim/30" />
        <div className="h-3 w-24 bg-sig-dim/10 rounded" />
        <div className="flex-1" />
        <div className="flex gap-1">
          {Object.values(VideoFeedSkeletonAction).map((action) => (
            <div key={action} className="h-5 w-5 bg-sig-dim/10 rounded" />
          ))}
        </div>
      </div>
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 p-1">
        {Object.values(VideoFeedSkeletonSlot).map((slot) => (
          <div
            key={slot}
            className="bg-black/80 rounded flex items-center justify-center"
          >
            <Tv aria-hidden className="w-6 h-6 text-sig-dim/15" />
          </div>
        ))}
      </div>
    </output>
  );
}
