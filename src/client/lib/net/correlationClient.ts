// The worker holds the records: the DataWorker rebases every source to it over
// a direct port. A request carries only news, which is not a DataWorker source,
// and the baseline. Nothing here structured-clones a record set.

import type { NewsArticle } from "@/features/news";
import type { CorrelationResult, RegionBaseline } from "../correlation";
import { computeCorrelations } from "../correlation";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import {
  CorrelationWorkerLocation,
  CorrelationWorkerMessageType,
  type CorrelationWorkerResponse,
} from "@/workers/correlation/protocol";

type Job = {
  requestId: number;
  resolve: (r: CorrelationResult) => void;
  news: NewsArticle[];
  baseline: RegionBaseline;
};

export type CorrelationClient = Readonly<{
  request(
    news: NewsArticle[],
    baseline: RegionBaseline,
  ): Promise<CorrelationResult>;
  terminate(): void;
}>;

/**
 * Without the worker there is no data port either, so this correlates news
 * against an empty record set rather than silently reporting a stale one.
 */
function inlineCompute(
  news: NewsArticle[],
  baseline: RegionBaseline,
): Promise<CorrelationResult> {
  return Promise.resolve(computeCorrelations([], news, baseline));
}

function inlineFallback(): CorrelationClient {
  return Object.freeze({
    request: inlineCompute,
    terminate() {
      /* no-op */
    },
  });
}

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
    worker = new Worker(CorrelationWorkerLocation.Script, {
      type: "module",
    });
  } catch {
    return inlineFallback();
  }

  const dataClient = getDataWorkerClient();
  if (dataClient && typeof MessageChannel !== "undefined") {
    const channel = new MessageChannel();
    const correlationSessionId = globalThis.crypto.randomUUID();
    worker.postMessage(
      {
        type: CorrelationWorkerMessageType.BindData,
        port: channel.port2,
        correlationSessionId,
      },
      [channel.port2],
    );
    void dataClient
      .connectCorrelation(channel.port1, correlationSessionId)
      .catch(() => undefined);
  }

  const pending = new Map<number, Job>();
  let nextId = 1;
  let latestRequestId = 0;
  let workerFailed = false;

  function fallback(): void {
    workerFailed = true;
    for (const job of pending.values()) {
      void inlineCompute(job.news, job.baseline).then(job.resolve);
    }
    pending.clear();
  }

  worker.onmessage = (e: MessageEvent<CorrelationWorkerResponse>) => {
    const msg = e.data;
    if (msg?.type !== CorrelationWorkerMessageType.Result) return;
    const job = pending.get(msg.requestId);
    if (!job) return;
    pending.delete(msg.requestId);
    if (msg.requestId < latestRequestId) return;
    job.resolve(msg.result);
  };

  worker.onerror = fallback;
  worker.onmessageerror = fallback;

  return Object.freeze({
    request(news, baseline) {
      if (workerFailed) return inlineCompute(news, baseline);
      const requestId = nextId++;
      latestRequestId = requestId;
      return new Promise<CorrelationResult>((resolve) => {
        pending.set(requestId, { requestId, resolve, news, baseline });
        try {
          worker.postMessage({
            type: CorrelationWorkerMessageType.Compute,
            requestId,
            news,
            baseline,
          });
        } catch {
          pending.delete(requestId);
          fallback();
          void inlineCompute(news, baseline).then(resolve);
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
