import assert from "node:assert/strict";
import test from "node:test";
import { ProductConfigAgentDailyMaintenanceService } from "../../src/productConfigAgent/workflow/dailyMaintenance.service.js";

function createLockClient(acquired = true) {
  return {
    calls: [] as string[],
    client: {
      $transaction: async (fn: any) =>
        fn({
          $queryRawUnsafe: async (_sql: string, key: number) => {
            return [{ locked: acquired }];
          },
        }),
    },
  };
}

test("daily maintenance runs dictionary refresh, dirty archive refresh, archive existing, and health audit", async () => {
  const calls: string[] = [];
  const lock = createLockClient(true);
  const service = new ProductConfigAgentDailyMaintenanceService({
    lockClient: lock.client,
    refreshDictionaryCandidates: async (params) => {
      calls.push(`dictionary:${params.source}`);
      return { createdOrUpdated: 3 };
    },
    renormalizeBatch: async (params) => {
      calls.push(`renormalize:${params.limit}:${params.scope}`);
      return { processed: 2 };
    },
    findArchiveCandidates: async (limit) => {
      calls.push(`findArchive:${limit}`);
      return [
        { documentId: 10, extractionResultId: 20, fileName: "a.xlsx" },
        { documentId: 11, extractionResultId: 21, fileName: "b.xlsx" },
      ];
    },
    archiveDocument: async (params) => {
      calls.push(`archive:${params.documentId}:${params.createdBy}:${params.force}`);
      return { archive: { id: Number(params.documentId) + 100 } };
    },
    createHealthReport: async (createdBy) => {
      calls.push(`health:${createdBy}`);
      return { id: 9 };
    },
  });

  const result = await service.runDailyMaintenance({
    createdBy: "tester",
    dirtyLimit: 7,
    archiveLimit: 4,
    forceArchive: true,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [
    "dictionary:daily_maintenance",
    "renormalize:7:with_pending_candidates",
    "findArchive:4",
    "archive:10:tester:true",
    "archive:11:tester:true",
    "health:tester",
  ]);
  assert.equal(result.archiveExisting.processedCount, 2);
  assert.equal(result.archiveExisting.successCount, 2);
  assert.deepEqual(
    result.archiveExisting.results.map((item) => item.archiveId),
    [110, 111],
  );
});

test("daily maintenance skips when advisory lock is not acquired", async () => {
  let called = false;
  const lock = createLockClient(false);
  const service = new ProductConfigAgentDailyMaintenanceService({
    lockClient: lock.client,
    refreshDictionaryCandidates: async () => {
      called = true;
      return {};
    },
  });

  const result = await service.runDailyMaintenance();

  assert.deepEqual(result, { status: "skipped", reason: "lock_not_acquired" });
  assert.equal(called, false);
});

test("archiveExisting reports per-document failures without failing the whole job", async () => {
  const lock = createLockClient(true);
  const service = new ProductConfigAgentDailyMaintenanceService({
    lockClient: lock.client,
    findArchiveCandidates: async () => [
      { documentId: 1, extractionResultId: 100, fileName: "ok.xlsx" },
      { documentId: 2, extractionResultId: 200, fileName: "bad.xlsx" },
    ],
    archiveDocument: async (params) => {
      if (Number(params.documentId) === 2) throw new Error("not ready");
      return { archive: { id: 500 } };
    },
  });

  const result = await service.archiveExisting({
    limit: 10,
    createdBy: "tester",
    force: false,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.processedCount, 2);
  assert.equal(result.successCount, 1);
  assert.equal(result.failedCount, 1);
  assert.deepEqual(result.failedResults, [
    {
      documentId: 2,
      extractionResultId: 200,
      fileName: "bad.xlsx",
      status: "failed",
      error: "not ready",
    },
  ]);
});
