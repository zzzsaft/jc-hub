import type {
  ArchiveItemSearchParams,
  ArchiveItemSearchResponse,
  ArchiveItemSearchResult,
} from "./archiveItemSearch.service.js";

export type ArchiveSearchAcceptanceExplanation =
  | "productType"
  | "material"
  | "width"
  | "application"
  | "lipAdjustmentMethod"
  | "deckleType";

export type ArchiveSearchAcceptanceFailureReason =
  | "no_results"
  | "top1_score_below_threshold"
  | "missing_required_explanation_productType"
  | "missing_required_explanation_material"
  | "missing_required_explanation_width"
  | "unexpected_warnings";

export type ArchiveSearchAcceptanceCase = ArchiveItemSearchParams & {
  name: string;
  requiredExplanations: ArchiveSearchAcceptanceExplanation[];
  minTop1Score: number;
};

export type ArchiveSearchAcceptanceCaseReport = {
  name: string;
  query: ArchiveItemSearchParams;
  resultCount: number;
  top5: ArchiveSearchAcceptanceTopResult[];
  explanationCoverage: Record<ArchiveSearchAcceptanceExplanation, boolean>;
  checks: {
    resultCountGt0: boolean;
    top1ScoreMeetsThreshold: boolean;
    requiredExplanationsPresent: boolean;
    noUnexpectedWarnings: boolean;
  };
  warnings: string[];
  failures: ArchiveSearchAcceptanceFailureReason[];
};

export type ArchiveSearchAcceptanceReport = {
  checkedAt: string;
  mode: "read-only";
  caseSource: "fixed_random_baseline";
  totalCases: number;
  passedCases: number;
  failedCases: number;
  scores: {
    recall: number;
    top1ScoreThreshold: number;
    explanationCoverage: number;
    warningFree: number;
    overall: number;
  };
  cases: ArchiveSearchAcceptanceCaseReport[];
  failureCases: Array<{
    name: string;
    queryText: string;
    failures: ArchiveSearchAcceptanceFailureReason[];
    top1Score: number | null;
    warnings: string[];
  }>;
  recommendedNextActions: string[];
};

export type ArchiveSearchAcceptanceTopResult = {
  rank: number;
  archiveItemId: string;
  archiveId: string;
  documentId: string | null;
  itemName: string | null;
  productType: string | null;
  similarityScore: number;
  matchReasons: string[];
  confirmedKeys: string[];
  evidence: ArchiveItemSearchResult["evidence"];
};

export const FIXED_RANDOM_BASELINE_CASES: ArchiveSearchAcceptanceCase[] = [
  {
    name: "pvc_wave_tile_die_1250",
    queryText: "1250mm PVC波浪瓦板模头",
    productType: "flat_die",
    materials: ["PVC"],
    application: "波浪瓦板",
    widthMm: 1250,
    requiredExplanations: ["productType", "material", "width"],
    minTop1Score: 0.55,
  },
  {
    name: "metering_pump_gd_e56",
    queryText: "GD-E56熔体计量泵",
    productType: "metering_pump",
    requiredExplanations: ["productType"],
    minTop1Score: 0.45,
  },
  {
    name: "filter_ssp_c100",
    queryText: "GD-SSP-C-100单板式双工位圆形液压换网器",
    productType: "filter",
    requiredExplanations: ["productType"],
    minTop1Score: 0.45,
  },
  {
    name: "melt_pipe_connector",
    queryText: "连接器（模头块）",
    productType: "melt_pipe",
    requiredExplanations: ["productType"],
    minTop1Score: 0.25,
  },
  {
    name: "hydraulic_station_single_valve",
    queryText: "单阀液压站",
    productType: "hydraulic_station",
    requiredExplanations: ["productType"],
    minTop1Score: 0.45,
  },
  {
    name: "static_mixer_jc_jthhq_b",
    queryText: "JC-JTHHQ-B静态混合器",
    productType: "static_mixer",
    requiredExplanations: ["productType"],
    minTop1Score: 0.45,
  },
  {
    name: "feedblock_three_layer",
    queryText: "三层共挤复合分配器",
    productType: "feedblock",
    requiredExplanations: ["productType"],
    minTop1Score: 0.45,
  },
  {
    name: "pp_pe_sheet_die_1850",
    queryText: "1850mmPP、PE片材模头",
    productType: "flat_die",
    materials: ["PP", "PE"],
    application: "片材",
    widthMm: 1850,
    requiredExplanations: ["productType", "material", "width"],
    minTop1Score: 0.55,
  },
];

export function buildArchiveSearchAcceptanceCaseReport(
  acceptanceCase: ArchiveSearchAcceptanceCase,
  response: ArchiveItemSearchResponse,
): ArchiveSearchAcceptanceCaseReport {
  const top1 = response.results[0] ?? null;
  const explanationCoverage = detectExplanationCoverage(top1?.matchReasons ?? []);
  const failures = buildFailureReasons(acceptanceCase, response, explanationCoverage);
  const requiredExplanationsPresent = acceptanceCase.requiredExplanations.every((explanation) => explanationCoverage[explanation]);

  return {
    name: acceptanceCase.name,
    query: summarizeQuery(acceptanceCase),
    resultCount: response.results.length,
    top5: response.results.slice(0, 5).map((result, index) => summarizeTopResult(result, index)),
    explanationCoverage,
    checks: {
      resultCountGt0: response.results.length > 0,
      top1ScoreMeetsThreshold: Boolean(top1 && top1.similarityScore >= acceptanceCase.minTop1Score),
      requiredExplanationsPresent,
      noUnexpectedWarnings: response.warnings.length === 0,
    },
    warnings: response.warnings,
    failures,
  };
}

export function buildArchiveSearchAcceptanceReport(
  caseReports: ArchiveSearchAcceptanceCaseReport[],
  checkedAt = new Date().toISOString(),
): ArchiveSearchAcceptanceReport {
  const failureCases = caseReports
    .filter((caseReport) => caseReport.failures.length > 0)
    .map((caseReport) => ({
      name: caseReport.name,
      queryText: caseReport.query.queryText,
      failures: caseReport.failures,
      top1Score: caseReport.top5[0]?.similarityScore ?? null,
      warnings: caseReport.warnings,
    }));

  return {
    checkedAt,
    mode: "read-only",
    caseSource: "fixed_random_baseline",
    totalCases: caseReports.length,
    passedCases: caseReports.length - failureCases.length,
    failedCases: failureCases.length,
    scores: {
      recall: ratio(caseReports, (caseReport) => caseReport.checks.resultCountGt0),
      top1ScoreThreshold: ratio(caseReports, (caseReport) => caseReport.checks.top1ScoreMeetsThreshold),
      explanationCoverage: ratio(caseReports, (caseReport) => caseReport.checks.requiredExplanationsPresent),
      warningFree: ratio(caseReports, (caseReport) => caseReport.checks.noUnexpectedWarnings),
      overall: ratio(caseReports, (caseReport) => caseReport.failures.length === 0),
    },
    cases: caseReports,
    failureCases,
    recommendedNextActions: buildRecommendedNextActions(failureCases),
  };
}

export function detectExplanationCoverage(
  matchReasons: string[],
): Record<ArchiveSearchAcceptanceExplanation, boolean> {
  const text = matchReasons.join("\n");
  return {
    productType: /产品类型匹配|product\s*type/i.test(text),
    material: /材料匹配|material/i.test(text),
    width: /宽度接近|宽度匹配|width/i.test(text),
    application: /应用匹配|application/i.test(text),
    lipAdjustmentMethod: /模唇调节方式匹配|lip/i.test(text),
    deckleType: /堵边\/调幅结构匹配|deckle/i.test(text),
  };
}

export function buildFailureReasons(
  acceptanceCase: ArchiveSearchAcceptanceCase,
  response: Pick<ArchiveItemSearchResponse, "results" | "warnings">,
  explanationCoverage = detectExplanationCoverage(response.results[0]?.matchReasons ?? []),
): ArchiveSearchAcceptanceFailureReason[] {
  const failures: ArchiveSearchAcceptanceFailureReason[] = [];
  const top1 = response.results[0] ?? null;

  if (response.results.length === 0) failures.push("no_results");
  if (!top1 || top1.similarityScore < acceptanceCase.minTop1Score) failures.push("top1_score_below_threshold");
  for (const explanation of acceptanceCase.requiredExplanations) {
    if (explanation === "productType" && !explanationCoverage.productType) {
      failures.push("missing_required_explanation_productType");
    }
    if (explanation === "material" && !explanationCoverage.material) {
      failures.push("missing_required_explanation_material");
    }
    if (explanation === "width" && !explanationCoverage.width) {
      failures.push("missing_required_explanation_width");
    }
  }
  if (response.warnings.length > 0) failures.push("unexpected_warnings");

  return [...new Set(failures)];
}

function summarizeQuery(acceptanceCase: ArchiveSearchAcceptanceCase): ArchiveItemSearchParams {
  return {
    queryText: acceptanceCase.queryText,
    ...(acceptanceCase.productType ? { productType: acceptanceCase.productType } : {}),
    ...(acceptanceCase.materials ? { materials: acceptanceCase.materials } : {}),
    ...(acceptanceCase.application ? { application: acceptanceCase.application } : {}),
    ...(acceptanceCase.lipAdjustmentMethod ? { lipAdjustmentMethod: acceptanceCase.lipAdjustmentMethod } : {}),
    ...(acceptanceCase.deckleType ? { deckleType: acceptanceCase.deckleType } : {}),
    ...(acceptanceCase.widthMm !== undefined ? { widthMm: acceptanceCase.widthMm } : {}),
    limit: 5,
  };
}

function summarizeTopResult(result: ArchiveItemSearchResult, index: number): ArchiveSearchAcceptanceTopResult {
  return {
    rank: index + 1,
    archiveItemId: result.archiveItemId,
    archiveId: result.archiveId,
    documentId: result.documentId,
    itemName: result.itemName,
    productType: result.productType,
    similarityScore: result.similarityScore,
    matchReasons: result.matchReasons,
    confirmedKeys: Object.keys(result.confirmedFields ?? {}),
    evidence: result.evidence,
  };
}

function buildRecommendedNextActions(
  failureCases: ArchiveSearchAcceptanceReport["failureCases"],
): string[] {
  if (failureCases.length === 0) return ["baseline acceptance passed; keep this fixed case set as the first-stage gate"];
  const failures = new Set(failureCases.flatMap((failureCase) => failureCase.failures));
  const actions: string[] = [];
  if (failures.has("no_results")) actions.push("inspect archive search recall for zero-result baseline queries");
  if (failures.has("top1_score_below_threshold")) actions.push("review scoring weights or structured feature coverage for low-scoring Top1 results");
  if (
    failures.has("missing_required_explanation_productType")
    || failures.has("missing_required_explanation_material")
    || failures.has("missing_required_explanation_width")
  ) {
    actions.push("backfill or normalize required explanation fields before raising this gate further");
  }
  if (failures.has("unexpected_warnings")) actions.push("resolve search warnings so acceptance output remains warning-free");
  return actions;
}

function ratio<T>(items: T[], predicate: (item: T) => boolean): number {
  if (items.length === 0) return 0;
  return Number((items.filter(predicate).length / items.length).toFixed(3));
}
