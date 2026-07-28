import { useEffect, useRef } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { RENDER_POLICY } from "@/workers/render/policy";
import { isWorkerOwnedPointType } from "@/workers/render/workerOwnedTypes";
import { sendRenderSurfaceCommand } from "@/render-surface/element";
import type { RenderWorkerColors } from "@/workers/render/protocol";

type PointCommandOptions = Readonly<{
  host: HTMLElement | null;
  data: readonly DataPoint[];
  dataVersion: number;
  colors: RenderWorkerColors;
}>;

type SourceJob = Readonly<{
  source: string;
  items: readonly DataPoint[];
}>;

function slimPoint(item: DataPoint): DataPoint {
  if (item.type === "events") {
    return { ...item, data: { severity: item.data.severity } };
  }
  return item;
}

export function usePointCommands({
  host,
  data,
  dataVersion,
  colors,
}: PointCommandOptions): void {
  const previousByType = useRef<ReadonlyMap<string, readonly DataPoint[]>>(
    new Map(),
  );
  const previousColors = useRef<RenderWorkerColors | null>(null);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let timer = 0;
    let offset = 0;
    const byType = new Map<string, DataPoint[]>();
    const changed = new Set<string>();
    const forceAll = previousColors.current !== colors;

    const schedule = (task: () => void): void => {
      timer = window.setTimeout(task, 0);
    };

    const sendJobs = (
      jobs: readonly SourceJob[],
      remaining: readonly SourceJob[] = jobs,
      jobOffset = 0,
    ): void => {
      if (cancelled) return;
      const [job, ...rest] = remaining;
      if (!job) {
        previousByType.current = byType;
        previousColors.current = colors;
        return;
      }
      const end = Math.min(
        jobOffset + RENDER_POLICY.dataChunkSize,
        job.items.length,
      );
      const items = job.items
        .slice(jobOffset, end)
        .map(slimPoint);
      sendRenderSurfaceCommand(host, {
        type: "data",
        payload: {
          source: job.source,
          data: items,
          colors,
          reset: jobOffset === 0,
          done: end >= job.items.length,
        },
      });
      schedule(() => {
        if (end < job.items.length) {
          sendJobs(jobs, remaining, end);
          return;
        }
        sendJobs(jobs, rest);
      });
    };

    const finishScan = (): void => {
      for (const [source, previous] of previousByType.current) {
        const current = byType.get(source);
        if (current) {
          if (current.length !== previous.length) changed.add(source);
          continue;
        }
        if (previous.length > 0 || forceAll) {
          byType.set(source, []);
          changed.add(source);
        }
      }
      const jobs = Array.from(changed, (source) => ({
        source,
        items: byType.get(source) ?? [],
      }));
      if (jobs.length === 0) {
        previousColors.current = colors;
        return;
      }
      sendJobs(jobs);
    };

    const scan = (): void => {
      if (cancelled) return;
      const end = Math.min(
        offset + RENDER_POLICY.dataChunkSize,
        data.length,
      );
      const batch = data.slice(offset, end);
      for (const item of batch) {
        // The DataWorker feeds these straight to the renderer. Bucketing and
        // cloning them here only to have the renderer discard them was the
        // largest per-poll allocation on the main thread.
        if (isWorkerOwnedPointType(item.type)) continue;
        const bucket = byType.get(item.type) ?? [];
        if (!byType.has(item.type)) byType.set(item.type, bucket);
        const sourceIndex = bucket.length;
        bucket.push(item);
        if (
          forceAll ||
          previousByType.current.get(item.type)?.[sourceIndex] !== item
        ) {
          changed.add(item.type);
        }
      }
      offset = end;
      if (offset < data.length) {
        schedule(scan);
        return;
      }
      finishScan();
    };

    schedule(scan);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [colors, data, dataVersion, host]);
}
