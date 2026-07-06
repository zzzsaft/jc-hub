import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import {
  detectCompositeMultiValue,
  runSemanticTriageForPendingCandidates,
  triageDictionaryCandidate,
} from "../../src/productConfigAgent/dictionary/candidateSemanticTriage.js";

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

test("qualifier strip rematches existing terms and misses without changing candidate shape", () => {
  const hit = triageDictionaryCandidate(
    { termType: "material", rawValue: "上模PVC" },
    { evaluatedAt: "2026-07-01T00:00:00.000Z", terms: [{ id: 10n, termType: "material", canonicalValue: "PVC" }] },
  );

  assert.deepEqual(hit.labels, ["qualifier_variant", "qualifier_rematch_found", "material_classified"]);
  assert.equal(hit.qualifier?.strippedValue, "PVC");
  assert.equal(hit.rematch?.matched, true);
  assert.equal(hit.rematch?.canonicalValue, "PVC");
  assert.equal(hit.recommendedReviewAction, "review_as_existing_value_variant");

  const miss = triageDictionaryCandidate(
    { termType: "material", rawValue: "PVC上模" },
    { evaluatedAt: "2026-07-01T00:00:00.000Z", terms: [] },
  );

  assert.equal(miss.qualifier?.strippedValue, "PVC");
  assert.equal(miss.rematch?.matched, false);
  assert.ok(miss.labels.includes("qualifier_rematch_miss"));
});

test("composite multi-value detects business separators and ignores unit rates", () => {
  assert.deepEqual(detectCompositeMultiValue("PVC/ABS"), { separator: "/", parts: ["PVC", "ABS"] });
  assert.deepEqual(detectCompositeMultiValue("PVC、PE"), { separator: "、", parts: ["PVC", "PE"] });
  assert.deepEqual(detectCompositeMultiValue("PVC+TPE"), { separator: "+", parts: ["PVC", "TPE"] });
  assert.equal(detectCompositeMultiValue("kg/h"), null);
  assert.equal(detectCompositeMultiValue("m/min"), null);
});

test("material/application classification and noise labels are evidence-only triage results", () => {
  const material = triageDictionaryCandidate({ termType: "product_material", rawValue: "PVC透明料" });
  assert.equal(material.classification?.materialFamily, "pvc");
  assert.equal(material.recommendedReviewAction, "review_material_class");

  const application = triageDictionaryCandidate({ termType: "application", rawValue: "PE膜" });
  assert.equal(application.classification?.applicationDomain, "film");
  assert.equal(application.recommendedReviewAction, "review_application_class");

  const noise = triageDictionaryCandidate({ termType: "application", rawValue: "备注：客户指定包装方式" });
  assert.ok(noise.labels.includes("document_note"));
  assert.equal(noise.recommendedReviewAction, "reject_or_doc_note");

  const placeholder = triageDictionaryCandidate({ termType: "application", rawValue: "N/A" });
  assert.ok(placeholder.labels.includes("noise"));
  assert.equal(placeholder.recommendedReviewAction, "reject_as_noise");
});

test("runner overwrites semanticTriage idempotently without appending evidence", async () => {
  const rows = new Map<bigint, any>([
    [
      1n,
      {
        id: 1n,
        termType: "material",
        rawValue: "上模PVC",
        evidence: { source: "test", semanticTriage: { version: "old", labels: ["old"] } },
        status: "pending",
      },
    ],
  ]);
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => [...rows.values()]);
  replaceMethod(prisma.dictionaryTerm as any, "findMany", async () => [
    { id: 2n, termType: "material", canonicalValue: "PVC" },
  ]);
  replaceMethod(prisma.dictionaryAlias as any, "findMany", async () => []);
  replaceMethod(prisma.dictionaryCandidate as any, "update", async ({ where, data }: any) => {
    const row = rows.get(where.id);
    Object.assign(row, data);
    return row;
  });

  await runSemanticTriageForPendingCandidates({ evaluatedAt: "2026-07-01T00:00:00.000Z" });
  await runSemanticTriageForPendingCandidates({ evaluatedAt: "2026-07-01T00:00:00.000Z" });
  await runSemanticTriageForPendingCandidates({ evaluatedAt: "2026-07-01T00:00:00.000Z" });

  const evidence = rows.get(1n)?.evidence;
  assert.equal(evidence.source, "test");
  assert.equal(evidence.semanticTriage.version, "phase2-v1");
  assert.deepEqual(evidence.semanticTriage.labels, ["qualifier_variant", "qualifier_rematch_found", "material_classified"]);
});
