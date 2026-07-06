import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import {
  applyArchiveFeatureBackfill,
  buildArchiveFeatureCoverageAudit,
  classifyArchiveFeatureCoverageRow,
  planArchiveFeatureBackfill,
  type ArchiveFeatureCoverageRow,
} from "../../src/productConfigAgent/archive/archiveFeatureCoverage.js";

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

test("archive feature coverage classifies missing similarity feature gaps", () => {
  const result = classifyArchiveFeatureCoverageRow({
    id: 1,
    archiveId: 10,
    itemIndex: 1,
    itemName: "Flat die",
    similarityFeaturesJson: { product_type: "flat_die", effective_width_mm: 1200 },
  });

  assert.ok(result.gaps.includes("confirmed_similarity_features"));
  assert.ok(result.gaps.includes("die_width_mm"));
  assert.ok(result.gaps.includes("thickness_mm"));
  assert.ok(result.gaps.includes("plastic_material"));
  assert.ok(result.gaps.includes("application"));
  assert.ok(result.gaps.includes("lip_adjustment_method"));
  assert.ok(result.gaps.includes("deckle_type"));
  assert.ok(result.gaps.includes("plastic_material_or_application"));
  assert.equal(result.gaps.includes("similarity_features"), false);
  assert.equal(result.gaps.includes("effective_width_mm_or_die_width_mm"), false);
});

test("archive feature coverage audit reports recoverable gaps and top missing term types", () => {
  const audit = buildArchiveFeatureCoverageAudit({
    rows: [
      {
        id: 1,
        archiveId: 10,
        itemIndex: 1,
        itemName: "Flat die",
        productTypeHint: "flat_die",
        similarityFeaturesJson: {},
        confirmedFieldsJson: {
          effective_width_mm: { value: 1.2, unit: "m" },
          plastic_material: "PP",
        },
        fieldsJson: { product_effective_thickness: { value: 0.8, unit: "mm" } },
      },
      {
        id: 2,
        archiveId: 11,
        itemIndex: 1,
        itemName: "Filter",
        similarityFeaturesJson: { product_type: "filter", plastic_material: "PVC", application: "sheet" },
      },
    ],
    totalArchives: 2,
  });

  assert.equal(audit.totalArchives, 2);
  assert.equal(audit.totalArchiveItems, 2);
  assert.equal(audit.archivesMissingSimilarityFeatures, 1);
  assert.equal(audit.missing.effective_width_mm_or_die_width_mm, 2);
  assert.equal(audit.recoverable.effective_width_mm, 1);
  assert.equal(audit.recoverable.thickness_mm, 1);
  assert.equal(audit.recoverable.product_type, 1);
  assert.ok(audit.topMissingTermTypes.some((item) => item.termType === "die_width"));
  assert.equal(audit.samples.similarity_features[0].archiveItemId, "1");
});

test("archive feature dry-run planner proposes updates without mutating rows", () => {
  const rows: ArchiveFeatureCoverageRow[] = [
    {
      id: 1,
      archiveId: 10,
      itemIndex: 1,
      itemName: "Flat die",
      productTypeHint: "flat_die",
      similarityFeaturesJson: {},
      confirmedFieldsJson: { die_width_mm: 1300 },
      fieldsJson: [
        {
          field_name: "有效宽度",
          raw_value: "1200",
          dictionary: {
            matched: true,
            term_type: "product_effective_width",
            number_unit: { value: 1200, unit: "mm" },
          },
        },
      ],
    },
  ];
  const before = JSON.stringify(rows);

  const proposals = planArchiveFeatureBackfill(rows);

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), JSON.parse(before));
  assert.deepEqual(
    proposals.map((proposal) => ({
      archiveItemId: proposal.archiveItemId,
      missingFeatureKey: proposal.missingFeatureKey,
      proposedValue: proposal.proposedValue,
      sourceTermType: proposal.sourceTermType,
    })),
    [
      {
        archiveItemId: "1",
        missingFeatureKey: "die_width_mm",
        proposedValue: 1300,
        sourceTermType: "die_width_mm",
      },
      {
        archiveItemId: "1",
        missingFeatureKey: "effective_width_mm",
        proposedValue: 1200,
        sourceTermType: "product_effective_width",
      },
      {
        archiveItemId: "1",
        missingFeatureKey: "product_type",
        proposedValue: "flat_die",
        sourceTermType: "product_type",
      },
    ],
  );
});

test("archive feature backfill apply updates feature JSON without touching updatedAt", async () => {
  const originalUpdatedAt = new Date("2024-01-02T03:04:05.000Z");
  const rawCalls: any[] = [];
  const tx = {
    contractArchiveItem: {
      findUnique: async () => ({
        similarityFeaturesJson: { product_type: "flat_die" },
        updatedAt: originalUpdatedAt,
      }),
      update: async (args: any) => {
        throw new Error(`unexpected Prisma model update: ${JSON.stringify(args)}`);
      },
    },
    $executeRaw: async (query: any) => {
      rawCalls.push(query);
      return 1;
    },
  };
  replaceMethod(prisma as any, "$transaction", (async (callback: any) => callback(tx)) as any);

  const result = await applyArchiveFeatureBackfill([
    {
      archiveItemId: "10",
      missingFeatureKey: "application",
      proposedValue: "流延膜",
      sourceTermType: "item_name_application",
      sourceFieldPath: "itemName",
      confidence: 0.78,
      evidence: { itemName: "CPE流延膜模头" },
    },
  ]);

  assert.equal(result.updatedCount, 1);
  assert.equal(rawCalls.length, 1);
  assert.match(String(rawCalls[0].sql ?? rawCalls[0].text ?? rawCalls[0]), /similarity_features_json/);
  assert.doesNotMatch(String(rawCalls[0].sql ?? rawCalls[0].text ?? rawCalls[0]), /updated_at/);
  assert.ok((rawCalls[0].values ?? []).some((value: unknown) => (
    typeof value === "string"
    && value.includes("\"application\":\"流延膜\"")
  )));
});

test("archive feature dry-run planner skips unsafe product type and material aliases", () => {
  const proposals = planArchiveFeatureBackfill([
    {
      id: 1,
      archiveId: 10,
      productTypeHint: "unknown",
      similarityFeaturesJson: {},
      fieldsJson: [
        {
          field_name: "本体材料",
          raw_value: "1.2311",
          dictionary: {
            matched: true,
            term_type: "product_material",
            canonical_value: "1.2311_Forged",
          },
        },
        {
          field_name: "应用类型",
          raw_value: "应用领域",
          dictionary: {
            matched: false,
            term_type: "application",
          },
        },
      ],
    },
  ]);

  assert.deepEqual(proposals, []);
});

test("archive feature dry-run planner recovers product width from item name", () => {
  const proposals = planArchiveFeatureBackfill([
    {
      id: 1,
      archiveId: 10,
      itemName: "1380mm PVC+UPVC波浪板模头",
      similarityFeaturesJson: { product_type: "flat_die", plastic_material: "PVC" },
    },
    {
      id: 2,
      archiveId: 11,
      itemName: "制品厚度 1.5-3.5mm",
      similarityFeaturesJson: {},
    },
  ]);

  assert.ok(proposals.some((proposal) => (
    proposal.archiveItemId === "1"
    && proposal.missingFeatureKey === "effective_width_mm"
    && proposal.proposedValue === 1380
    && proposal.sourceFieldPath === "itemName"
  )));
  assert.equal(proposals.some((proposal) => proposal.archiveItemId === "2" && proposal.missingFeatureKey === "effective_width_mm"), false);
});

test("archive feature dry-run planner recovers application from item name only when dictionary-confirmed", () => {
  const proposals = planArchiveFeatureBackfill([
    {
      id: 1,
      archiveId: 10,
      itemName: "PVC波浪瓦板模头",
      similarityFeaturesJson: { product_type: "flat_die", plastic_material: "PVC" },
    },
    {
      id: 2,
      archiveId: 11,
      itemName: "1380mm PVC+UPVC波浪板模头",
      similarityFeaturesJson: { product_type: "flat_die", plastic_material: "PVC" },
    },
  ], {
    applicationValues: [
      { canonicalValue: "波浪瓦板", matchValues: ["波浪瓦板"] },
    ],
  });

  assert.ok(proposals.some((proposal) => (
    proposal.archiveItemId === "1"
    && proposal.missingFeatureKey === "application"
    && proposal.proposedValue === "波浪瓦板"
    && proposal.sourceFieldPath === "itemName"
  )));
  assert.equal(proposals.some((proposal) => proposal.archiveItemId === "2" && proposal.missingFeatureKey === "application"), false);
});

test("archive feature dry-run planner recovers structure fields from confirmed fields and dictionary-confirmed text", () => {
  const proposals = planArchiveFeatureBackfill([
    {
      id: 1,
      archiveId: 10,
      itemName: "自动推拉式微调 PVC 板材模头",
      similarityFeaturesJson: { product_type: "flat_die" },
      confirmedFieldsJson: { deckle_type: "external_slotted_deckle" },
      fieldsJson: [
        {
          field_name: "模唇调节",
          raw_value: "自动推拉式微调",
          dictionary: {
            matched: true,
            term_type: "lip_adjustment_method",
            canonical_value: "auto_push_pull_fine_adjustment",
          },
        },
      ],
    },
    {
      id: 2,
      archiveId: 11,
      itemName: "外堵铣槽式 片材模头",
      similarityFeaturesJson: { product_type: "flat_die" },
    },
  ], {
    structureValues: {
      deckle_type: [
        { canonicalValue: "external_slotted_deckle", matchValues: ["外堵铣槽式"] },
      ],
      lip_adjustment_method: [
        { canonicalValue: "auto_push_pull_fine_adjustment", matchValues: ["自动推拉式微调"] },
      ],
    },
  });

  assert.ok(proposals.some((proposal) => (
    proposal.archiveItemId === "1"
    && proposal.missingFeatureKey === "lip_adjustment_method"
    && proposal.proposedValue === "auto_push_pull_fine_adjustment"
    && proposal.sourceFieldPath === "fieldsJson[0]"
  )));
  assert.ok(proposals.some((proposal) => (
    proposal.archiveItemId === "1"
    && proposal.missingFeatureKey === "deckle_type"
    && proposal.proposedValue === "external_slotted_deckle"
    && proposal.sourceFieldPath === "confirmedFieldsJson.deckle_type"
  )));
  assert.ok(proposals.some((proposal) => (
    proposal.archiveItemId === "2"
    && proposal.missingFeatureKey === "deckle_type"
    && proposal.proposedValue === "external_slotted_deckle"
    && proposal.sourceFieldPath === "itemName"
  )));
});
