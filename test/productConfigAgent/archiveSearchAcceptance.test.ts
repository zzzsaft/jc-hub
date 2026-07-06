import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArchiveSearchAcceptanceCaseReport,
  buildArchiveSearchAcceptanceReport,
  buildFailureReasons,
  detectExplanationCoverage,
  type ArchiveSearchAcceptanceCase,
} from "../../src/productConfigAgent/archive/archiveSearchAcceptance.js";
import type {
  ArchiveItemSearchResponse,
  ArchiveItemSearchResult,
} from "../../src/productConfigAgent/archive/archiveItemSearch.service.js";

const baseCase: ArchiveSearchAcceptanceCase = {
  name: "pvc_wave_tile_die_1250",
  queryText: "1250mm PVC波浪瓦板模头",
  productType: "flat_die",
  materials: ["PVC"],
  application: "波浪瓦板",
  widthMm: 1250,
  requiredExplanations: ["productType", "material", "width"],
  minTop1Score: 0.55,
};

test("archive search acceptance detects explanation coverage from Chinese match reasons", () => {
  const coverage = detectExplanationCoverage([
    "产品类型匹配：flat_die",
    "材料匹配：PVC",
    "宽度接近：目标 1250mm，历史 1250mm，差值 0mm",
    "应用匹配：波浪瓦板",
    "模唇调节方式匹配：auto_push_pull_fine_adjustment",
    "堵边/调幅结构匹配：external_slotted_deckle",
  ]);

  assert.deepEqual(coverage, {
    productType: true,
    material: true,
    width: true,
    application: true,
    lipAdjustmentMethod: true,
    deckleType: true,
  });
});

test("archive search acceptance produces fixed failure reasons for low score, no results, missing explanations, and warnings", () => {
  assert.deepEqual(
    buildFailureReasons(baseCase, response([], ["no archive item matches found"])),
    [
      "no_results",
      "top1_score_below_threshold",
      "missing_required_explanation_productType",
      "missing_required_explanation_material",
      "missing_required_explanation_width",
      "unexpected_warnings",
    ],
  );

  assert.deepEqual(
    buildFailureReasons(baseCase, response([
      result({
        similarityScore: 0.4,
        matchReasons: ["产品类型匹配：flat_die"],
      }),
    ])),
    [
      "top1_score_below_threshold",
      "missing_required_explanation_material",
      "missing_required_explanation_width",
    ],
  );

  assert.deepEqual(
    buildFailureReasons(baseCase, response([
      result({
        similarityScore: 0.7,
        matchReasons: ["产品类型匹配：flat_die", "材料匹配：PVC", "宽度接近：目标 1250mm，历史 1250mm，差值 0mm"],
      }),
    ], ["diagnostic warning"])),
    ["unexpected_warnings"],
  );
});

test("archive search acceptance case report includes top5, coverage, checks, and failures", () => {
  const caseReport = buildArchiveSearchAcceptanceCaseReport(
    baseCase,
    response([
      result({
        archiveItemId: "10",
        itemName: "1250mm PVC波浪瓦板模头",
        similarityScore: 0.78,
        matchReasons: ["产品类型匹配：flat_die", "材料匹配：PVC", "宽度接近：目标 1250mm，历史 1250mm，差值 0mm"],
      }),
      result({ archiveItemId: "9", similarityScore: 0.5 }),
    ]),
  );

  assert.equal(caseReport.query.limit, 5);
  assert.equal(caseReport.resultCount, 2);
  assert.equal(caseReport.top5[0].archiveItemId, "10");
  assert.equal(caseReport.top5[0].rank, 1);
  assert.equal(caseReport.explanationCoverage.application, false);
  assert.deepEqual(caseReport.checks, {
    resultCountGt0: true,
    top1ScoreMeetsThreshold: true,
    requiredExplanationsPresent: true,
    noUnexpectedWarnings: true,
  });
  assert.deepEqual(caseReport.failures, []);
});

test("archive search acceptance summary calculates passed, failed, and scores", () => {
  const passed = buildArchiveSearchAcceptanceCaseReport(
    baseCase,
    response([
      result({
        similarityScore: 0.78,
        matchReasons: ["产品类型匹配：flat_die", "材料匹配：PVC", "宽度接近：目标 1250mm，历史 1250mm，差值 0mm"],
      }),
    ]),
  );
  const failed = buildArchiveSearchAcceptanceCaseReport(baseCase, response([], ["no archive item matches found"]));

  const report = buildArchiveSearchAcceptanceReport([passed, failed], "2026-07-05T00:00:00.000Z");

  assert.equal(report.checkedAt, "2026-07-05T00:00:00.000Z");
  assert.equal(report.mode, "read-only");
  assert.equal(report.caseSource, "fixed_random_baseline");
  assert.equal(report.totalCases, 2);
  assert.equal(report.passedCases, 1);
  assert.equal(report.failedCases, 1);
  assert.deepEqual(report.scores, {
    recall: 0.5,
    top1ScoreThreshold: 0.5,
    explanationCoverage: 0.5,
    warningFree: 0.5,
    overall: 0.5,
  });
  assert.equal(report.failureCases[0].name, baseCase.name);
  assert.ok(report.recommendedNextActions.length > 0);
});

function response(results: ArchiveItemSearchResult[], warnings: string[] = []): ArchiveItemSearchResponse {
  return {
    source: "archive_item_search",
    supported: true,
    query: {
      queryText: baseCase.queryText,
      tokens: [],
      limit: 5,
    },
    results,
    warnings,
    usageRules: {
      confirmedFields: "confirmedFields can be treated as reliable historical configuration.",
      unresolvedFields: "unresolvedFieldsSummary is reference-only and must not be used as confirmed configuration or quote basis.",
      quoteReadyFalseMeansNoDirectQuote: true,
      noQuoteAgentCall: true,
      noEmbedding: true,
    },
  };
}

function result(overrides: Partial<ArchiveItemSearchResult> = {}): ArchiveItemSearchResult {
  return {
    archiveItemId: "1",
    archiveId: "2",
    documentId: null,
    itemName: "历史 item",
    productType: "flat_die",
    similarityScore: 0.7,
    matchReasons: [],
    confirmedFields: { product_type: "flat_die" },
    unresolvedFieldsSummary: [],
    agentReadiness: {},
    searchableTextSummary: null,
    evidence: { archiveId: "2" },
    ...overrides,
  };
}
