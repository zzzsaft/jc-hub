import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { PrismaProductConfigAgentRepository } from "../../src/modules/productConfigAgent/db.service.js";

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

test("refreshDictionaryCandidates is idempotent and only collects allowed proposal value candidates", async () => {
  const repository = new PrismaProductConfigAgentRepository();
  const candidates = new Map<string, any>();
  const occurrences = new Map<string, any>();
  let nextCandidateId = 1n;
  let extractionFindManyArgs: any = null;

  replaceMethod(prisma.extractionResult as any, "findMany", async (args: any) => {
    extractionFindManyArgs = args;
    return [
    {
      id: 101n,
      documentId: 11n,
      extractionJson: {},
      normalizedExtractionJson: {
        document_info: {
          customer_name: "客户A",
          contract_number: "HT-1",
          drawing_date: "2026-07-01",
        },
        items: [
          {
            item_index: 1,
            product_name: "1380mm PVC透明瓦模头",
            fields: {
              product_name: "1380mm PVC透明瓦模头",
              material: "PVC",
              model: "M-1",
              type: "should_not_be_scanned",
            },
          },
        ],
        dictionaryProposals: {
          proposals: [
            { candidateType: "value", termType: "application", rawValue: "透气膜", itemIndex: 1, fieldPath: "$.items[0].fields.application", reason: "missing_value_alias" },
            { candidateType: "value", termType: "remark", rawValue: "长备注", itemIndex: 1, fieldPath: "$.items[0].fields.remark", reason: "missing_value_alias" },
            { candidateType: "value", termType: "collectable_text", rawValue: "可采集文本", itemIndex: 1, fieldPath: "$.items[0].fields.collectable_text", reason: "missing_value_alias" },
            { candidateType: "value", termType: "heating_power", rawValue: "12kW", itemIndex: 1, fieldPath: "$.items[0].fields.heating_power", reason: "missing_value_alias" },
            { candidateType: "value", termType: "delivery_date", rawValue: "2026-07-01", itemIndex: 1, fieldPath: "$.document_info.drawing_date", reason: "missing_value_alias" },
            { candidateType: "value", termType: "customer_name", rawValue: "客户A", itemIndex: 1, fieldPath: "$.document_info.customer_name", reason: "missing_value_alias" },
            { candidateType: "value", termType: "plastic_material", rawValue: "at", itemIndex: 1, fieldPath: "$.items[0].fields.plastic_material", reason: "enums_token_no_match" },
            { candidateType: "value", termType: "plastic_material", rawValue: "10min at 230°C", itemIndex: 1, fieldPath: "$.items[0].fields.plastic_material", reason: "enums_token_no_match" },
          ],
        },
      },
    },
  ];
  });
  replaceMethod(prisma.dictionaryTermType as any, "findMany", async () => [
    { termType: "application", valueKind: "enum" },
    { termType: "remark", valueKind: "text" },
    { termType: "collectable_text", valueKind: "text" },
    { termType: "heating_power", valueKind: "number_unit" },
    { termType: "delivery_date", valueKind: "date" },
    { termType: "customer_name", valueKind: "text" },
    { termType: "plastic_material", valueKind: "enums" },
  ]);
  replaceMethod(prisma.dictionaryCandidate as any, "upsert", async ({ where, create, update }: any) => {
    const unique = where.termType_normalizedRawValue_status;
    const key = `${unique.termType}\u0000${unique.normalizedRawValue}\u0000${unique.status}`;
    const existing = candidates.get(key);
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const row = {
      id: nextCandidateId++,
      ...create,
    };
    candidates.set(key, row);
    return row;
  });
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "create", async ({ data }: any) => {
    if (occurrences.has(data.occurrenceHash)) {
      const error: any = new Error("Unique constraint failed");
      error.code = "P2002";
      throw error;
    }
    occurrences.set(data.occurrenceHash, data);
    return { id: BigInt(occurrences.size), ...data };
  });
  replaceMethod(prisma.dictionaryCandidateOccurrence as any, "findFirst", async ({ where }: any) => {
    return [...occurrences.values()].find((item: any) =>
      item.occurrenceHash === where.OR?.[0]?.occurrenceHash ||
      (
        item.candidateType === where.OR?.[1]?.candidateType &&
        item.candidateId === where.OR?.[1]?.candidateId &&
        item.extractionResultId === where.OR?.[1]?.extractionResultId &&
        item.itemIndex === where.OR?.[1]?.itemIndex &&
        item.fieldName === where.OR?.[1]?.fieldName
      ),
    ) ?? null;
  });
  replaceMethod(prisma.dictionaryCandidate as any, "findMany", async () => [...candidates.values()]);
  replaceMethod(prisma.dictionaryTerm as any, "findMany", async () => []);
  replaceMethod(prisma.dictionaryAlias as any, "findMany", async () => []);
  replaceMethod(prisma.dictionaryCandidate as any, "update", async ({ where, data }: any) => {
    const row = [...candidates.values()].find((candidate) => candidate.id === where.id);
    if (row) Object.assign(row, data);
    return row;
  });
  replaceMethod(prisma.productDocument as any, "update", async () => ({}));

  await repository.refreshDictionaryCandidates({ documentId: 11, source: "test" });
  await repository.refreshDictionaryCandidates({ documentId: 11, source: "test" });
  await repository.refreshDictionaryCandidates({ documentId: 11, source: "test" });

  assert.equal(occurrences.size, 1);
  assert.equal(extractionFindManyArgs?.take, 1);
  assert.deepEqual(
    [...candidates.values()].map((candidate) => `${candidate.termType}:${candidate.rawValue}`).sort(),
    ["application:透气膜"],
  );
  for (const candidate of candidates.values()) {
    assert.equal(candidate.confidence, 0.65);
    assert.ok(candidate.evidence.semanticTriage);
  }
});
