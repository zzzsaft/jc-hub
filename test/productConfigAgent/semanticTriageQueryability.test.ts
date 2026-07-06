import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { DictionaryGovernanceService } from "../../src/productConfigAgent/dictionary/governance.service.js";
import { PrismaProductConfigAgentRepository } from "../../src/productConfigAgent/db.service.js";

const now = new Date("2026-07-01T00:00:00.000Z");
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
  return implementation as any;
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    termType: "material",
    rawValue: "PVC",
    normalizedRawValue: "pvc",
    proposedCanonicalValue: "PVC",
    evidence: {},
    confidence: 0.8,
    status: "pending",
    sourceProductType: "flat_die",
    updatedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function semantic(labels: string[]) {
  return {
    candidateType: "value",
    semanticTriage: {
      version: "phase2-v1",
      evaluatedAt: "2026-07-01T00:00:00.000Z",
      labels,
      recommendedReviewAction: "normal_review",
      confidence: 0.8,
    },
  };
}

function mockOccurrences(counts: Record<string, number>) {
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async ({ where }: any) => {
    const ids = new Set((where?.candidateId?.in ?? []).map((id: bigint) => String(id)));
    return Object.entries(counts)
      .filter(([candidateId]) => ids.has(candidateId))
      .flatMap(([candidateId, count]) =>
        Array.from({ length: count }, (_, index) => ({
          candidateId: BigInt(candidateId),
          documentId: BigInt(100 + index),
          extractionResultId: BigInt(200 + index),
          fieldName: `$.items[${index}].material`,
          rawValue: "sample",
          evidence: {},
          createdAt: now,
        })),
      );
  });
}

test("candidate list filters semantic tags, groups, risk, and sorts by governance priority", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  const rows = [
    candidate({ id: 1n, rawValue: "上模PVC", evidence: semantic(["qualifier_variant", "qualifier_rematch_found"]), confidence: 0.95 }),
    candidate({ id: 2n, rawValue: "PVC/ABS", evidence: semantic(["composite_multi_value"]), confidence: 0.8 }),
    candidate({ id: 3n, rawValue: "N/A", evidence: semantic(["noise"]), confidence: 0.4 }),
    candidate({ id: 4n, rawValue: "备注：客户指定", evidence: semantic(["document_note"]), confidence: 0.6 }),
    candidate({ id: 5n, rawValue: "PVC透明料", evidence: semantic(["material_classified"]), confidence: 0.99 }),
  ];
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => rows);
  mockOccurrences({ "1": 3, "2": 1, "3": 5, "4": 2, "5": 10 });

  const qualifier = await repository.listCandidates({ semanticTag: "qualifier_variant" });
  assert.deepEqual(qualifier.items.map((item: any) => item.id), [1]);
  assert.equal(qualifier.items[0].semanticRisk, "medium");

  const composite = await repository.listCandidates({ semanticTag: "composite_multi_value" });
  assert.deepEqual(composite.items.map((item: any) => item.id), [2]);

  const noiseExact = await repository.listCandidates({ semanticTag: "noise" });
  assert.deepEqual(noiseExact.items.map((item: any) => item.id), [3]);

  const noiseGroup = await repository.listCandidates({ semanticGroup: "noise", sort: "frequency" });
  assert.deepEqual(noiseGroup.items.map((item: any) => item.id), [3, 4]);

  const highRisk = await repository.listCandidates({ semanticRisk: "high", sort: "governance_priority" });
  assert.deepEqual(highRisk.items.map((item: any) => item.id), [3, 4, 2]);
  assert.ok(highRisk.items.every((item: any) => item.semanticRisk === "high"));

  const priority = await repository.listCandidates({ sort: "governance_priority" });
  assert.deepEqual(priority.items.map((item: any) => item.id), [3, 4, 2, 1, 5]);
});

test("clusters filter before grouping and expose derived semantic governance fields", async () => {
  const service = new DictionaryGovernanceService();
  const rows = [
    candidate({ id: 1n, termType: "material", rawValue: "PVC/ABS", normalizedRawValue: "pvc/abs", evidence: semantic(["composite_multi_value"]), confidence: 0.8 }),
    candidate({ id: 2n, termType: "material", rawValue: "N/A", normalizedRawValue: "n/a", evidence: semantic(["noise"]), confidence: 0.5 }),
    candidate({ id: 3n, termType: "application", rawValue: "PE膜", normalizedRawValue: "pe膜", evidence: semantic(["application_classified"]), confidence: 0.9 }),
    candidate({ id: 4n, termType: "material", rawValue: "PVC上模", normalizedRawValue: "pvc上模", evidence: semantic(["qualifier_variant", "qualifier_rematch_miss"]), confidence: 0.7 }),
  ];
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => rows);
  mockOccurrences({ "1": 2, "2": 4, "3": 6, "4": 3 });

  const composite = await service.listClusters({ semanticGroup: "composite" });
  assert.deepEqual(composite.items.map((item: any) => item.rawValues[0]), ["PVC/ABS"]);
  assert.equal(composite.items[0].semanticRisk, "high");
  assert.ok(composite.items[0].governancePriorityScore > 0);

  const byRisk = await service.listClusters({ groupBy: "semanticRisk", sort: "frequency" });
  assert.deepEqual(byRisk.groups.map((group: any) => group.groupKey), ["high", "low", "medium"]);
  assert.deepEqual(byRisk.groups.find((group: any) => group.groupKey === "high").items.map((item: any) => item.rawValues[0]), ["N/A", "PVC/ABS"]);

  const byTag = await service.listClusters({ groupBy: "semanticTag", semanticRisk: "medium" });
  assert.deepEqual(byTag.groups.map((group: any) => group.groupKey), ["qualifier_rematch_miss", "qualifier_variant"]);

  const byTermType = await service.listClusters({ groupBy: "termType", semanticGroup: "classification" });
  assert.deepEqual(byTermType.groups.map((group: any) => group.groupKey), ["application"]);
});
