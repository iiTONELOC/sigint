import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/features/news";
import type { CorrelationResult, RegionBaseline } from "./correlation";
import { computeCorrelations } from "./correlation";

type Job = {
  requestId: number;
  resolve: (r: CorrelationResult) => void;
  allData: DataPoint[];
  news: NewsArticle[];
  baseline: RegionBaseline;
};

type WorkerResponse = {
  type: "result";
  requestId: number;
  result: CorrelationResult;
};

export type CorrelationClient = Readonly<{
  request(
    allData: DataPoint[],
    news: NewsArticle[],
    baseline: RegionBaseline,
  ): Promise<CorrelationResult>;
  terminate(): void;
}>;

function inlineCompute(
  allData: DataPoint[],
  news: NewsArticle[],
  baseline: RegionBaseline,
): Promise<CorrelationResult> {
  return Promise.resolve(computeCorrelations(allData, news, baseline));
}

function inlineFallback(): CorrelationClient {
  return Object.freeze({
    request: inlineCompute,
    terminate() {
      /* no-op */
    },
  });
}

const WORKER_URL = "/workers/correlationWorker.js";

export function createCorrelationClient(): CorrelationClient {
  if (typeof Worker === "undefined") return inlineFallback();
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as { happyDOM?: unknown }).happyDOM !== undefined
  ) {
    return inlineFallback();
  }

  let worker: Worker;
  try {
    worker = new Worker(WORKER_URL, { type: "module" });
  } catch {
    return inlineFallback();
  }

  const pending = new Map<number, Job>();
  let nextId = 1;
  let latestRequestId = 0;
  let workerFailed = false;

  function fallback(): void {
    workerFailed = true;
    for (const job of pending.values()) {
      void inlineCompute(job.allData, job.news, job.baseline).then(
        job.resolve,
      );
    }
    pending.clear();
  }

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg?.type !== "result") return;
    const job = pending.get(msg.requestId);
    if (!job) return;
    pending.delete(msg.requestId);
    if (msg.requestId < latestRequestId) return;
    job.resolve(msg.result);
  };

  worker.onerror = fallback;
  worker.onmessageerror = fallback;

  return Object.freeze({
    request(allData, news, baseline) {
      if (workerFailed) return inlineCompute(allData, news, baseline);
      const requestId = nextId++;
      latestRequestId = requestId;
      return new Promise<CorrelationResult>((resolve) => {
        pending.set(requestId, {
          requestId,
          resolve,
          allData,
          news,
          baseline,
        });
        try {
          worker.postMessage({
            type: "compute",
            requestId,
            allData,
            news,
            baseline,
          });
        } catch {
          pending.delete(requestId);
          fallback();
          void inlineCompute(allData, news, baseline).then(resolve);
        }
      });
    },
    terminate() {
      try {
        worker.terminate();
      } catch {
        /* worker may already be terminated */
      }
      pending.clear();
    },
  });
}
