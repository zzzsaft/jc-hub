import assert from "node:assert/strict";
import test from "node:test";
import { ProductConfigAgentPendingLlmJobService } from "../../src/productConfigAgent/workflow/pendingLlmJob.service.js";
import { ProductConfigAgentBlockParsingService } from "../../src/productConfigAgent/workflow/blockParsing.service.js";

test("pending LLM job tracks concurrency, stream progress, and per-document failures", async () => {
  const progressUpdates: any[] = [];
  let running = 0;
  let maxRunning = 0;
  const service = new ProductConfigAgentPendingLlmJobService({
    listPendingDocuments: async () => [
      { id: 1, fileName: "a.xlsx" },
      { id: 2, fileName: "b.xlsx" },
      { id: 3, fileName: "c.xlsx" },
    ],
    updateJobProgress: async (_jobId, _progress, resultJson) => {
      progressUpdates.push(structuredClone(resultJson));
    },
    extractDocument: async ({ documentId, onStreamProgress }) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      onStreamProgress?.({ contentLength: Number(documentId) * 10, chunkCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (Number(documentId) === 2) throw new Error("llm failed");
      return { ok: true };
    },
  });

  const result = await service.runPendingLlmBatch({
    limit: 3,
    concurrency: 2,
    jobId: 99,
  });

  assert.equal(maxRunning, 2);
  assert.equal(result.total, 3);
  assert.equal(result.processed, 3);
  assert.equal(result.successCount, 2);
  assert.equal(result.failedCount, 1);
  assert.deepEqual(result.currentDocumentIds, []);
  assert.deepEqual(result.errors, [{ documentId: 2, fileName: "b.xlsx", error: "llm failed" }]);
  assert.equal(result.documentProgress.find((item) => item.documentId === 2)?.status, "failed");
  assert.ok(progressUpdates.some((item) => item.currentDocumentIds.length > 0));
});

test("block parsing reuses existing blocks by hash unless forceReparse is set", async () => {
  const calls: string[] = [];
  const documentsByHash = new Map<string, any>([
    ["hash-a", { id: 10, fileName: "a.xlsx", fileHash: "hash-a", status: "parsed" }],
  ]);
  const blocksByDocumentId = new Map<number, any>([
    [10, { id: 20, documentId: 10, parserVersion: "old" }],
  ]);
  const service = new ProductConfigAgentBlockParsingService({
    calculateFileSha256: async () => "hash-a",
    parseBlocks: async () => {
      calls.push("parse");
      return { llm_text: "parsed" };
    },
    repository: {
      findDocumentByHash: async (hash) => documentsByHash.get(hash) ?? null,
      createDocument: async (data) => ({ id: 11, ...data }),
      findBlocksByDocumentId: async (documentId) => blocksByDocumentId.get(Number(documentId)) ?? null,
      upsertBlocks: async (data) => {
        calls.push(`upsert:${data.documentId}`);
        return { id: 21, ...data };
      },
      updateDocumentStatus: async (documentId, status) => {
        calls.push(`status:${documentId}:${status}`);
      },
    },
  });

  const reused = await service.parseAndSaveBlocks({ filePath: "/tmp/a.xlsx" });
  const reparsed = await service.parseAndSaveBlocks({ filePath: "/tmp/a.xlsx", forceReparse: true });

  assert.equal(reused.reusedBlocks, true);
  assert.equal(reparsed.reusedBlocks, false);
  assert.deepEqual(calls, ["parse", "upsert:10", "status:10:parsed"]);
});

test("block parsing batch reports partial failures with stage metadata", async () => {
  const service = new ProductConfigAgentBlockParsingService({
    calculateFileSha256: async (filePath) => {
      if (filePath.includes("bad-hash")) throw new Error("cannot hash");
      return filePath.includes("a") ? "hash-a" : "hash-b";
    },
    parseBlocks: async (input) => {
      if (input.filePath.includes("bad-parse")) {
        throw Object.assign(new Error("cannot parse"), {
          stage: "productConfigAgent:parseBlocks",
          errorCode: "PARSE_FAILED",
        });
      }
      return { llm_text: input.filePath };
    },
    repository: {
      findDocumentByHash: async (hash) => null,
      createDocument: async (data) => ({ id: data.fileHash === "hash-a" ? 1 : 2, ...data }),
      findBlocksByDocumentId: async () => null,
      upsertBlocks: async (data) => ({ id: Number(data.documentId) + 100, ...data }),
      updateDocumentStatus: async () => {},
    },
  });

  const result = await service.parseAndSaveBlocksBatch([
    { filePath: "/tmp/a.xlsx" },
    { filePath: "/tmp/bad-hash.xlsx" },
    { filePath: "/tmp/bad-parse.xlsx" },
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.successCount, 1);
  assert.equal(result.failedCount, 2);
  assert.deepEqual(
    result.errors.map((error) => [error.filePath, error.stage, error.errorCode]),
    [
      ["/tmp/bad-hash.xlsx", "productConfigAgent:workflow", "PRODUCT_CONFIG_AGENT_WORKFLOW_FAILED"],
      ["/tmp/bad-parse.xlsx", "productConfigAgent:parseBlocks", "PARSE_FAILED"],
    ],
  );
});
