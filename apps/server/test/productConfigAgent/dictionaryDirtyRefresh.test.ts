import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { productConfigAgentRepository } from "../../src/modules/productConfigAgent/db.service.js";
import {
  ProductConfigAgentService,
  normalizeDirtyRefreshConcurrency,
  runDictionaryDirtyRefreshBatch,
  uniqueExtractionsByDocumentId,
} from "../../src/modules/productConfigAgent/service.js";

const restoreFns: Array<() => void> = [];

test.afterEach(() => {
  while (restoreFns.length > 0) restoreFns.pop()?.();
  mock.restoreAll();
});

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, implementation: T[K]) {
  const original = target[key];
  Object.defineProperty(target, key, { value: implementation, configurable: true });
  restoreFns.push(() => {
    Object.defineProperty(target, key, { value: original, configurable: true });
  });
}

test("dictionary dirty refresh batch caps concurrency, isolates failures, and dedupes documents", async () => {
  const items = uniqueExtractionsByDocumentId([
    { documentId: 1, id: 101 },
    { documentId: 2, id: 201 },
    { documentId: 1, id: 102 },
    { documentId: 3, id: 301 },
  ]);
  const processed: number[] = [];
  const failed: number[] = [];
  let running = 0;
  let maxRunning = 0;

  await runDictionaryDirtyRefreshBatch(items, 2, async (item) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      if (item.documentId === 2) throw new Error("refresh failed");
      processed.push(item.documentId);
    } catch {
      failed.push(item.documentId);
    } finally {
      running -= 1;
    }
  });

  assert.equal(maxRunning, 2);
  assert.deepEqual(items.map((item) => item.documentId), [1, 2, 3]);
  assert.deepEqual(processed.sort(), [1, 3]);
  assert.deepEqual(failed, [2]);
  assert.equal(normalizeDirtyRefreshConcurrency(99), 8);
  assert.equal(normalizeDirtyRefreshConcurrency(0), 1);
});

test("startDictionaryDirtyRefresh enqueues dictionary job only", async () => {
  const service = new ProductConfigAgentService();
  const jobTypes: string[] = [];
  replaceMethod(productConfigAgentRepository, "enqueueJob", (async (data: any) => {
    jobTypes.push(data.jobType);
    return { id: 9, ...data };
  }) as any);
  replaceMethod(productConfigAgentRepository, "completeJob", (async () => ({})) as any);
  replaceMethod(service, "runDictionaryDirtyRefresh", (async () => ({
    scanned: 0,
    queued: 0,
    processed: 0,
    successCount: 0,
    failedCount: 0,
    progress: [],
  })) as any);

  await service.startDictionaryDirtyRefresh({ concurrency: 4 });

  assert.deepEqual(jobTypes, ["dictionary_dirty_refresh"]);
  assert.ok(!jobTypes.includes("pending_llm_upload"));
});
