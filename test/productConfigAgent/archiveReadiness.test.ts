import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { ContractArchiveService } from "../../src/productConfigAgent/archive/archive.service.js";

const now = new Date("2026-07-01T00:00:00.000Z");
const restoreFns: Array<() => void> = [];

test.afterEach(() => {
  while (restoreFns.length > 0) restoreFns.pop()?.();
  mock.restoreAll();
});

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, implementation: T[K]) {
  const original = target[key];
  Object.defineProperty(target, key, { value: implementation, configurable: true });
  restoreFns.push(() => Object.defineProperty(target, key, { value: original, configurable: true }));
}

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    id: 10n,
    documentId: 1n,
    extractionJson: {},
    normalizedExtractionJson: {
      document_info: { product_number: { value: "PN-001" } },
      items: [{ item_index: 1, item_name: "过滤器", product_type_hint: { value: "filter" } }],
    },
    dictionaryProposals: null,
    warnings: null,
    llmPlanJson: null,
    llmModel: null,
    promptVersion: null,
    dictionaryVersion: null,
    status: "normalized",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("archive readiness warns for candidates without blocking insert", async () => {
  replaceMethod(prisma.productDocument as any, "findUnique", async () => ({ id: 1n, status: "normalized" }));
  replaceMethod(prisma.documentBlock as any, "findUnique", async () => ({ id: 2n, documentId: 1n, blocksJson: {} }));
  replaceMethod(prisma.extractionResult as any, "findFirst", async () => extraction());
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => [
    { candidateId: 100n },
    { candidateId: 101n },
  ]);
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => [
    { evidence: { candidateType: "term_type" } },
    { evidence: { candidateType: "value" } },
  ]);

  const result = await new ContractArchiveService().checkArchiveReadiness(1);

  assert.equal(result.canArchive, true);
  assert.equal(result.forceRequired, false);
  assert.equal(result.summary.termTypeCandidateCount, 1);
  assert.equal(result.summary.valueCandidateCount, 1);
  assert.ok(!result.blockers.some((blocker) => blocker.type === "term_type_candidates"));
  assert.ok(result.warnings.some((warning) => warning.type === "term_type_candidates"));
  assert.ok(result.warnings.some((warning) => warning.type === "value_candidates"));
});

test("archive readiness falls back to summary counts and llm plan docInfo", async () => {
  replaceMethod(prisma.productDocument as any, "findUnique", async () => ({ id: 1n, status: "normalized" }));
  replaceMethod(prisma.documentBlock as any, "findUnique", async () => null);
  replaceMethod(prisma.extractionResult as any, "findFirst", async () =>
    extraction({
      normalizedExtractionJson: {
        summary: { term_type_candidate_count: 0, value_candidate_count: 2 },
        items: [{ item_index: 1, item_name: "模头", product_type_hint: { value: "flat_die" } }],
      },
      dictionaryProposals: { summary: { value_candidate_count: 3 } },
      llmPlanJson: { document_info: { product_number: "PLAN-PN" } },
    }),
  );
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => []);

  const result = await new ContractArchiveService().checkArchiveReadiness(1);

  assert.equal(result.canArchive, true);
  assert.equal(result.forceRequired, false);
  assert.equal(result.summary.productNumber, "PLAN-PN");
  assert.equal(result.summary.docInfoSource, "llm_plan_json");
  assert.equal(result.summary.valueCandidateCount, 3);
  assert.ok(result.warnings.some((warning) => warning.type === "doc_info_from_plan"));
  assert.ok(result.warnings.some((warning) => warning.type === "blocks_missing"));
});

test("archive readiness blocks missing normalized extraction items only by insert gate rules", async () => {
  replaceMethod(prisma.productDocument as any, "findUnique", async () => ({ id: 1n, status: "normalized" }));
  replaceMethod(prisma.documentBlock as any, "findUnique", async () => ({ id: 2n }));
  replaceMethod(prisma.extractionResult as any, "findFirst", async () =>
    extraction({ normalizedExtractionJson: { document_info: {}, items: [] } }),
  );
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => []);

  const result = await new ContractArchiveService().checkArchiveReadiness(1);

  assert.equal(result.canArchive, false);
  assert.ok(result.blockers.some((blocker) => blocker.type === "missing_required_field"));
  assert.ok(!result.blockers.some((blocker) => blocker.type === "missing_product_number"));
});

test("archive readiness blocks item missing product type, item name, and raw evidence", async () => {
  replaceMethod(prisma.productDocument as any, "findUnique", async () => ({ id: 1n, status: "normalized" }));
  replaceMethod(prisma.documentBlock as any, "findUnique", async () => ({ id: 2n }));
  replaceMethod(prisma.extractionResult as any, "findFirst", async () =>
    extraction({ normalizedExtractionJson: { document_info: {}, items: [{ item_index: 1, fields: {}, raw_fields: [] }] } }),
  );
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => []);

  const result = await new ContractArchiveService().checkArchiveReadiness(1);

  assert.equal(result.canArchive, false);
  assert.ok(result.blockers.some((blocker) => blocker.type === "missing_item_identity"));
});
