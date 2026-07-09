import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { DictionaryGovernanceService } from "../../src/modules/productConfigAgent/dictionary/governance.service.js";
import { dictionaryMatcherService } from "../../src/modules/productConfigAgent/dictionary/matcher.service.js";
import { PrismaProductConfigAgentRepository } from "../../src/modules/productConfigAgent/db.service.js";

const now = new Date("2026-07-01T00:00:00.000Z");
const restoreFns: Array<() => void> = [];

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    termType: "material",
    rawValue: "PVC",
    normalizedValue: "pvc",
    canonicalValue: null,
    status: "pending",
    score: 0.9,
    occurrenceCount: 2,
    source: "test",
    metadata: { candidateType: "value" },
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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

test("batch review rejects invalid candidate/action mapping without blocking valid rows", async () => {
  const service = new DictionaryGovernanceService();
  replaceMethod(prisma as any, "$transaction", async (callback: any) => callback(prisma));
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async ({ where }: any) => {
    if (where?.id?.in) {
      return [candidate({ id: 1n, evidence: { candidateType: "term_type" } }), candidate({ id: 2n, evidence: { candidateType: "value" } })];
    }
    return [];
  });
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => []);
  replaceMethod(prisma as any, "$executeRawUnsafe", async () => ({ count: 1 }));

  const result = await service.reviewCandidatesBatch({
    reviewedBy: "tester",
    reviews: [
      { candidateId: "1", candidateType: "term_type", action: "create_value" },
      { candidateId: "2", candidateType: "value", action: "reject" },
    ],
  });

  assert.equal(result.successCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.results[0].success, false);
  assert.match(String(result.results[0].error), /not allowed/);
  assert.equal(result.results[1].success, true);
  assert.equal(result.refreshDeferred, false);
});

test("batch review bulk writes terms, aliases, candidates, version, dirty docs, and keeps row failures local", async () => {
  const service = new DictionaryGovernanceService();
  const rows = [
    candidate({ id: 1n, rawValue: "PVC", normalizedRawValue: "pvc", proposedCanonicalValue: "PVC", evidence: { candidateType: "value" } }),
    candidate({ id: 2n, rawValue: "PVC sheet", normalizedRawValue: "pvc sheet", proposedCanonicalValue: "PVC", evidence: { candidateType: "value" } }),
    candidate({ id: 3n, rawValue: "bad alias", normalizedRawValue: "badalias", proposedCanonicalValue: "ABS", evidence: { candidateType: "value" } }),
    candidate({ id: 4n, rawValue: "color", normalizedRawValue: "color", proposedCanonicalValue: "red", evidence: { candidateType: "value" } }),
    candidate({ id: 5n, termType: "color", rawValue: "green", normalizedRawValue: "green", proposedCanonicalValue: "Green", evidence: { candidateType: "value" } }),
    candidate({ id: 6n, rawValue: "old", normalizedRawValue: "old", proposedCanonicalValue: "old", evidence: { candidateType: "value" } }),
    candidate({ id: 7n, rawValue: "DUP", normalizedRawValue: "dup", proposedCanonicalValue: "DUP", evidence: { candidateType: "value" } }),
    candidate({ id: 8n, rawValue: "PVC alias", normalizedRawValue: "pvcalias", proposedCanonicalValue: "PVC", evidence: { candidateType: "value" } }),
  ];
  const terms = new Map<string, any>([
    ["material\u0000PVC", { id: 10n, termType: "material", canonicalValue: "PVC" }],
    ["material\u0000ABS", { id: 11n, termType: "material", canonicalValue: "ABS" }],
    ["finish\u0000red", { id: 12n, termType: "finish", canonicalValue: "red" }],
    ["color\u0000Green", { id: 13n, termType: "color", canonicalValue: "Green" }],
    ["material\u0000DUP", { id: 14n, termType: "material", canonicalValue: "DUP" }],
  ]);
  const termCreateMany = mock.fn(async ({ data }: any) => {
    for (const item of data) {
      const key = `${item.termType}\u0000${item.canonicalValue}`;
      if (!terms.has(key)) terms.set(key, { id: BigInt(terms.size + 20), ...item });
    }
    return { count: data.length };
  });
  const aliasCreateMany = mock.fn(async () => ({ count: 0 }));
  const changeLogCreateMany = mock.fn(async ({ data }: any) => ({ count: data.length }));
  const dirty = mock.fn(async () => ({ count: 6 }));
  const rawUpdate = mock.fn(async () => ({ count: 6 }));
  const invalidate = mock.method(dictionaryMatcherService, "invalidate", () => undefined);

  replaceMethod(prisma as any, "$transaction", async (callback: any) => callback(prisma));
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async ({ where }: any) => {
    if (where?.id?.in) return rows.filter((item) => where.id.in.some((id: bigint) => id === item.id));
    if (where?.OR?.some((item: any) => item.normalizedRawValue === "dup")) {
      return [{ id: 99n, termType: "material", normalizedRawValue: "dup", status: "approved" }];
    }
    return [];
  });
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => [
    { candidateId: 1n, documentId: 100n },
    { candidateId: 2n, documentId: 101n },
    { candidateId: 5n, documentId: 102n },
  ]);
  replaceMethod(prisma.dictionaryTerm as any, "createMany", termCreateMany as any);
  replaceMethod(prisma.dictionaryTerm as any, "findMany", async ({ where }: any) =>
    where.OR.map((item: any) => terms.get(`${item.termType}\u0000${item.canonicalValue}`)).filter(Boolean),
  );
  replaceMethod(prisma.dictionaryAlias as any, "findMany", async ({ where }: any) =>
    where.OR.some((item: any) => item.normalizedAlias === "badalias")
      ? [{ id: 1n, termId: 999n, termType: "material", normalizedAlias: "badalias", aliasValue: "bad alias" }]
      : [],
  );
  replaceMethod(prisma.dictionaryAlias as any, "createMany", aliasCreateMany as any);
  replaceMethod(prisma.dictionaryTermTypeAlias as any, "findMany", async () => []);
  replaceMethod(prisma.dictionaryVersion as any, "upsert", async () => ({ versionKey: "default", versionValue: 8n }));
  replaceMethod(prisma.dictionaryChangeLog as any, "createMany", changeLogCreateMany as any);
  replaceMethod(prisma.productDocument as any, "updateMany", dirty as any);
  replaceMethod(prisma as any, "$executeRawUnsafe", rawUpdate as any);

  const result = await service.reviewCandidatesBatch({
    reviewedBy: "tester",
    reviews: [
      { candidateId: "1", action: "create_value", canonicalValue: "PVC" },
      { candidateId: "2", action: "create_value", canonicalValue: "PVC" },
      { candidateId: "3", action: "approve_as_alias", canonicalValue: "ABS" },
      { candidateId: "4", action: "move_to_other_term_type", targetTermType: "finish", canonicalValue: "red" },
      { candidateId: "5", action: "reject" },
      { candidateId: "6", action: "needs_human_review" },
      { candidateId: "7", action: "create_value", canonicalValue: "DUP" },
      { candidateId: "8", action: "approve_as_alias", canonicalValue: "PVC" },
    ],
  });

  assert.equal(result.requestedCount, 8);
  assert.equal(result.successCount, 7);
  assert.equal(result.failedCount, 1);
  assert.equal(result.results[2].success, false);
  assert.match(result.results[2].error, /Alias already points/);
  assert.equal(result.results[6].result.candidate.status, "merged");
  assert.equal(result.results[4].refreshDeferred, false);
  assert.deepEqual(result.affectedDocumentIds, [100, 101, 102]);
  assert.equal(termCreateMany.mock.callCount(), 2);
  assert.equal(aliasCreateMany.mock.callCount(), 1);
  assert.equal(rawUpdate.mock.callCount(), 1);
  assert.equal(changeLogCreateMany.mock.callCount(), 1);
  assert.equal(changeLogCreateMany.mock.calls[0].arguments[0].data.length, 5);
  assert.equal(dirty.mock.callCount(), 1);
  assert.equal(invalidate.mock.callCount(), 1);
});

test("dictionary-changing review marks affected documents dirty, bumps version, and invalidates matcher cache", async () => {
  const service = new DictionaryGovernanceService();
  replaceMethod(prisma.dictionaryCandidate as any, "findUnique", async () => candidate());
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => [
    { documentId: 10n },
    { documentId: 11n },
    { documentId: 10n },
  ]);
  replaceMethod(prisma.dictionaryTerm as any, "upsert", async ({ create }: any) => ({
    id: 100n,
    ...create,
    isActive: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }));
  replaceMethod(prisma.dictionaryCandidate as any, "update", async ({ data }: any) => ({
    ...candidate(),
    ...data,
  }));
  replaceMethod(prisma.dictionaryVersion as any, "upsert", async () => ({
    id: 1n,
    versionKey: "default",
    versionValue: 7n,
    description: "test",
    createdAt: now,
    updatedAt: now,
  }));
  const changeLog = mock.fn(async ({ data }: any) => data);
  replaceMethod(prisma.dictionaryChangeLog as any, "create", changeLog as any);
  const dirty = mock.fn(async ({ where, data }: any) => ({ where, data, count: 2 }));
  replaceMethod(prisma.productDocument as any, "updateMany", dirty as any);
  const invalidate = mock.method(dictionaryMatcherService, "invalidate", () => undefined);

  const result = await service.reviewCandidate({
    candidateId: "1",
    candidateType: "value",
    action: "create_value",
    reviewedBy: "tester",
  });

  assert.deepEqual(result.affectedDocumentIds, [10, 11]);
  assert.equal(result.refreshDeferred, true);
  assert.equal(result.candidateRecheckDeferred, true);
  assert.equal(result.dictionaryVersion, 7);
  assert.equal(invalidate.mock.callCount(), 1);
  assert.equal(changeLog.mock.callCount(), 1);
  assert.deepEqual(dirty.mock.calls[0].arguments[0].data, { dictionaryDirty: true });
});

test("clusters expose batch governance shape with candidate ids and occurrence samples", async () => {
  const service = new DictionaryGovernanceService();
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => [
    candidate({
      id: 3n,
      sourceProductType: "flat_die",
      evidence: {
        candidateType: "value",
        semanticTriage: {
          version: "phase2-v1",
          evaluatedAt: "2026-07-01T00:00:00.000Z",
          labels: ["composite_multi_value"],
          recommendedReviewAction: "review_composite",
          confidence: 0.8,
          composite: { separator: "/", parts: ["PVC", "ABS"] },
        },
      },
    }),
  ]);
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findMany", async () => [
    { candidateId: 3n, documentId: 20n, extractionResultId: 30n, fieldName: "$.items[0].material", rawValue: "PVC", evidence: { item: 0 }, createdAt: now },
    { candidateId: 3n, documentId: 21n, extractionResultId: 31n, fieldName: "$.items[1].material", rawValue: "PVC", evidence: { item: 1 }, createdAt: now },
  ]);

  const result = await service.listClusters({ status: "pending" });
  const cluster = result.items[0];

  assert.equal(cluster.candidateType, "value");
  assert.deepEqual(cluster.candidateIds, ["3"]);
  assert.equal(cluster.sourceProductType, "flat_die");
  assert.equal(cluster.documentCount, 2);
  assert.equal(cluster.occurrenceCount, 2);
  assert.equal(cluster.sampleOccurrences.length, 2);
  assert.equal(cluster.batchOperationsPreview[0].action, "create_value");
  assert.equal(cluster.recommendedReviewAction, "review_composite");
  assert.deepEqual(cluster.semanticTriage.composite.parts, ["PVC", "ABS"]);
});

test("health report detects duplicate aliases, pending pressure, split suggestions, non-enum candidates, and risk labels", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  replaceMethod(prisma.dictionaryTermType as any, "findMany", async (args?: any) => {
    if (args?.where?.isActive) {
      return [
        { termType: "remark", displayName: "Remark", kind: "text", metadata: {}, isActive: true },
        { termType: "material", displayName: "Material", kind: "enum", metadata: { valueKind: "enum" }, isActive: true },
      ];
    }
    return [
      { termType: "remark", displayName: "Remark", kind: "text", metadata: {}, isActive: true },
      { termType: "material", displayName: "Material", kind: "enum", metadata: { valueKind: "enum" }, isActive: true },
    ];
  });
  replaceMethod(prisma.dictionaryTerm as any, "findMany", async () => [{ id: 1n, termType: "material", canonicalValue: "PVC", isActive: true }]);
  replaceMethod(prisma.dictionaryCandidate as any, "groupBy", async () => [{ status: "pending", _count: { status: 2 } }]);
  replaceMethod(prisma.dictionaryAlias as any, "findMany", async () => [
    { id: 1n, termId: 1n, termType: "material", aliasValue: "PVC", normalizedAlias: "pvc", baselineRiskLabels: ["collision"] },
    { id: 2n, termId: 2n, termType: "color", aliasValue: "PVC", normalizedAlias: "pvc", baselineRiskLabels: ["collision", "manual_review"] },
  ]);
  replaceMethod(prisma.dictionaryTermTypeAlias as any, "findMany", async () => [
    { id: 3n, termType: "plastic_material", aliasValue: "PVC", normalizedAlias: "pvc" },
  ]);
  replaceMethod(prisma.dictionaryValueSplitSuggestion as any, "findMany", async () => [
    { id: 4n, termType: "material", sourceValue: "PVC board", partsJson: [{ termType: "material", value: "PVC" }] },
  ]);
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => [
    candidate({ id: 5n, termType: "remark", rawValue: "客户备注", metadata: { candidateType: "value" } }),
    candidate({ id: 6n, termType: "material", rawValue: "PVC", metadata: { candidateType: "value" } }),
  ]);
  replaceMethod(prisma.dictionaryHealthReport as any, "create", async ({ data }: any) => ({
    id: 9n,
    ...data,
    createdAt: now,
    updatedAt: now,
  }));

  const result = await repository.createHealthReport("tester");

  assert.equal(result.summary.pendingCandidates, 2);
  assert.deepEqual(result.summary.semanticTriageStats, {
    qualifier: 0,
    qualifierRematchFound: 0,
    composite: 0,
    materialApplication: 0,
    noiseDocumentNote: 0,
  });
  assert.equal(result.summary.riskLabelCounts.collision, 2);
  assert.ok(result.findings.some((finding) => finding.type === "duplicate_alias"));
  assert.ok(result.findings.some((finding) => finding.type === "pending_candidate_pressure"));
  assert.ok(result.findings.some((finding) => finding.type === "split_suggestion"));
  assert.ok(result.findings.some((finding) => finding.type === "non_enum_value_candidate"));
  assert.ok(result.findings.some((finding) => finding.type === "risk_label_summary"));
});

test("upsert term type stores full metadata including search policy", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  const calls: any[] = [];
  replaceMethod(prisma.dictionaryTermType as any, "upsert", async (args: any) => {
    calls.push(args);
    return { id: 1n, termType: args.create.termType, ...args.create };
  });
  replaceMethod(prisma.dictionaryVersion as any, "upsert", async () => ({ versionKey: "default", versionValue: 2n }));
  replaceMethod(prisma.dictionaryChangeLog as any, "create", async () => ({}));

  const metadata = {
    valueKind: "enum",
    applicableProductTypes: ["flat_die"],
    category: "material",
    searchPolicy: { tier: "primary", spaces: ["similarity", "keyword", "quote"] },
  };
  const result = await repository.upsertTermType({ termType: "plastic_material", displayName: "Plastic Material", metadata });

  assert.equal(result.metadata.searchPolicy.tier, "primary");
  assert.deepEqual(calls[0].create.metadata, metadata);
  assert.deepEqual(calls[0].update.metadata, metadata);
  assert.deepEqual(calls[0].create.applicableProductTypes, ["flat_die"]);
});

test("update term type stores search policy metadata without dropping projected columns", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  const updates: any[] = [];
  replaceMethod(prisma.dictionaryTermType as any, "findUnique", async () => ({
    id: 2n,
    termType: "application",
    displayName: "Application",
    valueKind: "enum",
    applicableProductTypes: ["common"],
    metadata: {
      existingFlag: true,
      searchPolicy: { tier: "primary", spaces: ["keyword"] },
      valueKind: "stale_metadata_value_kind",
    },
  }));
  replaceMethod(prisma.dictionaryTermType as any, "update", async (args: any) => {
    updates.push(args.data);
    return { id: 2n, termType: "application", displayName: "Application", ...args.data };
  });
  replaceMethod(prisma.dictionaryVersion as any, "upsert", async () => ({ versionKey: "default", versionValue: 3n }));
  replaceMethod(prisma.dictionaryChangeLog as any, "create", async () => ({}));

  const metadata = {
    valueKind: "enum",
    applicableProductTypes: ["flat_die", "coating_die"],
    category: "usage",
    description: "Application type",
    searchPolicy: { tier: "secondary", spaces: ["similarity", "keyword", "context"] },
  };
  const result = await repository.updateTermType("2", { metadata });

  assert.equal(result.metadata.searchPolicy.tier, "secondary");
  assert.equal(updates[0].valueKind, "enum");
  assert.deepEqual(updates[0].applicableProductTypes, ["flat_die", "coating_die"]);
  assert.equal(updates[0].category, "usage");
  assert.equal(updates[0].description, "Application type");
  assert.deepEqual(updates[0].metadata, {
    existingFlag: true,
    valueKind: "enum",
    applicableProductTypes: ["flat_die", "coating_die"],
    category: "usage",
    description: "Application type",
    searchPolicy: { tier: "secondary", spaces: ["similarity", "keyword", "context"] },
  });
});

test("update term type root-merges metadata without letting old metadata overwrite projected columns", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  const updates: any[] = [];
  replaceMethod(prisma.dictionaryTermType as any, "findUnique", async () => ({
    id: 3n,
    termType: "remark",
    displayName: "Remark",
    valueKind: "text",
    applicableProductTypes: ["common"],
    metadata: {
      existingFlag: true,
      valueKind: "enum",
      category: "stale_category",
      searchPolicy: { tier: "tertiary", spaces: ["keyword"] },
    },
  }));
  replaceMethod(prisma.dictionaryTermType as any, "update", async (args: any) => {
    updates.push(args.data);
    return { id: 3n, termType: "remark", displayName: "Remark", ...args.data };
  });
  replaceMethod(prisma.dictionaryVersion as any, "upsert", async () => ({ versionKey: "default", versionValue: 4n }));
  replaceMethod(prisma.dictionaryChangeLog as any, "create", async () => ({}));

  const result = await repository.updateTermType("3", {
    metadata: { searchPolicy: { tier: "context", spaces: ["context"] } },
  });

  assert.equal(result.metadata.existingFlag, true);
  assert.deepEqual(result.metadata.searchPolicy, { tier: "context", spaces: ["context"] });
  assert.equal(updates[0].valueKind, undefined);
  assert.equal(updates[0].applicableProductTypes, undefined);
  assert.equal(updates[0].category, undefined);
  assert.equal(updates[0].description, undefined);
  assert.deepEqual(updates[0].metadata, {
    existingFlag: true,
    valueKind: "enum",
    category: "stale_category",
    searchPolicy: { tier: "context", spaces: ["context"] },
  });
});
