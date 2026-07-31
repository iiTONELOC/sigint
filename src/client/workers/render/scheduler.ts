export type FrameSchedulerOptions = Readonly<{
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  render: (time: number) => boolean;
}>;

export type FrameScheduler = Readonly<{
  invalidate: () => void;
  stop: () => void;
  isScheduled: () => boolean;
}>;

export function createFrameScheduler(
  options: FrameSchedulerOptions,
): FrameScheduler {
  let frameHandle: number | null = null;
  let stopped = false;

  const invalidate = (): void => {
    if (stopped || frameHandle !== null) return;
    frameHandle = options.requestFrame((time) => {
      frameHandle = null;
      if (stopped) return;
      if (options.render(time)) invalidate();
    });
  };

  return {
    invalidate,

    stop(): void {
      stopped = true;
      if (frameHandle === null) return;
      options.cancelFrame(frameHandle);
      frameHandle = null;
    },

    isScheduled(): boolean {
      return frameHandle !== null;
    },
  };
}
