import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import {
  auditArchiveFeatureCoverage,
  planArchiveFeatureBackfillFromDatabase,
  type ArchiveFeatureBackfillProposal,
  type ArchiveFeatureCoverageAudit,
} from "./archiveFeatureCoverage.js";
import { archiveItemSearchService, type ArchiveItemSearchResult } from "./archiveItemSearch.service.js";

export type ArchiveFeatureDecision = "auto_apply" | "human_review" | "hold" | "reject";
export type ArchiveFeatureCandidateStatus = "pending" | "applied" | "skipped" | "rolled_back";
export type ArchiveFeatureBatchMode = "dry-run" | "apply" | "rollback";

export type ArchiveFeatureOptimizationPolicy = {
  limit: number;
  minConfidence: number;
  maxBatchSize: number;
  autoApplyMinConfidence: number;
  humanReviewMinConfidence: number;
  allowedAutoApplyFeatureKeys: string[];
  structureFeatureKeys: string[];
  trustedAutoApplySources: string[];
  excludedValues: string[];
  genericValues: string[];
  rejectLowInformationEvidence: boolean;
};

export type EvaluatedArchiveFeatureCandidate = ArchiveFeatureBackfillProposal & {
  batchId: string;
  proposedValueHash: string;
  decision: ArchiveFeatureDecision;
  decisionScore: number;
  expectedSearchGain: number;
  riskFlags: string[];
  status: ArchiveFeatureCandidateStatus;
};

export type PersistedArchiveFeatureCandidate = EvaluatedArchiveFeatureCandidate & {
  candidateId: string;
};

export type SearchEffectQuery = {
  name: string;
  queryText: string;
  productType?: string;
  materials?: string[];
  application?: string;
  lipAdjustmentMethod?: string;
  deckleType?: string;
  widthMm?: number;
};

export type SearchEffectSnapshot = {
  phase: "before" | "after" | "rollback_after";
  query: SearchEffectQuery;
  topResults: Array<{
    archiveItemId: string;
    archiveId: string;
    itemName: string | null;
    score: number;
    matchReasons: string[];
    explainability: Record<string, boolean>;
  }>;
  metrics: SearchEffectMetrics;
};

export type SearchEffectMetrics = {
  resultCount: number;
  top1Score: number;
  top5AverageScore: number;
  productTypeExplanationCount: number;
  materialExplanationCount: number;
  widthExplanationCount: number;
  applicationExplanationCount: number;
  lipAdjustmentExplanationCount: number;
  deckleExplanationCount: number;
};

export type ArchiveFeatureBatchReport = {
  batchId: string;
  mode: ArchiveFeatureBatchMode;
  policy: ArchiveFeatureOptimizationPolicy;
  funnelDiagnostics: FunnelDiagnostics;
  coverageDelta: {
    before: CoverageSummary;
    after: CoverageSummary;
    deltaMissingByFeature: Record<string, number>;
  };
  candidateStats: ReturnType<typeof summarizeCandidates>;
  applied: {
    candidateCount: number;
    updatedCount: number;
    skippedCount: number;
    skippedExistingFeaturePresent: number;
  };
  searchImpact: ReturnType<typeof computeSearchImpact>;
  featureImpact: {
    plannedByFeature: Record<string, number>;
    autoApplyByFeature: Record<string, number>;
    humanReviewByFeature: Record<string, number>;
    rejectByFeature: Record<string, number>;
  };
  riskSummary: ReturnType<typeof summarizeRisks>;
  decision: {
    action: "continue" | "adjust" | "rollback" | "hold";
    owner: "system" | "human";
    requiresHumanApproval: boolean;
    confidence: number;
    reasons: string[];
  };
};

type CandidateDbRow = { id: bigint | number | string };
type BackfillLogRow = {
  id: bigint;
  candidate_id: bigint;
  archive_item_id: bigint;
  feature_key: string;
  before_similarity_features_json: unknown;
};
type RollbackVerificationRow = {
  archive_item_id: bigint;
  current_similarity_features_json: unknown;
  before_similarity_features_json: unknown;
  rolled_back_at: Date | null;
};

export type ApplyArchiveFeatureBatchResult = {
  candidateCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedExistingFeaturePresent: number;
};

export type FunnelDiagnostics = {
  scanCount: number;
  plannerCandidateCount: number;
  insertedCandidateCount: number;
  eligibleCandidateCount: number;
  appliedCandidateCount: number;
  filteredOut: {
    lowConfidence: number;
    genericValue: number;
    existingFeaturePresent: number;
    unsupportedFeature: number;
    structureRequiresReview: number;
    unsafeSource: number;
    notAutoApplyEligible: number;
  };
  byFeature: Record<string, number>;
  bySource: Record<string, number>;
  byDecision: Record<string, number>;
};

export type RollbackVerificationReport = {
  batchId: string;
  checkedCount: number;
  restoredCount: number;
  unrestoredCount: number;
  restored: boolean;
  items: Array<{
    archiveItemId: string;
    restored: boolean;
    rolledBack: boolean;
  }>;
};

const AUDITED_FEATURE_KEYS = [
  "effective_width_mm",
  "die_width_mm",
  "thickness_mm",
  "product_type",
  "plastic_material",
  "application",
  "lip_adjustment_method",
  "deckle_type",
];

export const DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY: ArchiveFeatureOptimizationPolicy = {
  limit: 500,
  minConfidence: 0.75,
  maxBatchSize: 500,
  autoApplyMinConfidence: 0.9,
  humanReviewMinConfidence: 0.75,
  allowedAutoApplyFeatureKeys: [
    "product_type",
    "effective_width_mm",
    "plastic_material",
    "application",
  ],
  structureFeatureKeys: ["lip_adjustment_method", "deckle_type"],
  trustedAutoApplySources: ["confirmedFieldsJson"],
  excludedValues: ["other", "其他", "无", "none", "unknown", "未知"],
  genericValues: ["外堵式", "external_standard_deckle", "integral_structure", "lip_integral_structure"],
  rejectLowInformationEvidence: true,
};

export const DEFAULT_SEARCH_EFFECT_QUERIES: SearchEffectQuery[] = [
  {
    name: "wave_board_width_material",
    queryText: "1380mm PVC+UPVC 波浪板模头",
    productType: "flat_die",
    materials: ["PVC", "UPVC"],
    application: "波浪板",
    widthMm: 1380,
  },
  {
    name: "auto_push_pull_pvc_sheet",
    queryText: "自动推拉 PVC 板材模头",
    productType: "flat_die",
    materials: ["PVC"],
    application: "板材",
    lipAdjustmentMethod: "自动推拉",
  },
  {
    name: "external_slotted_sheet",
    queryText: "外堵铣槽式 片材模头",
    productType: "flat_die",
    application: "片材",
    deckleType: "外堵铣槽式",
  },
  {
    name: "manual_lip_external_slotted_pp_sheet",
    queryText: "手动推式微调 外堵铣槽式 PP 片材模头",
    productType: "flat_die",
    materials: ["PP"],
    application: "片材",
    lipAdjustmentMethod: "手动推式微调",
    deckleType: "外堵铣槽式",
  },
];

export async function runArchiveFeatureOptimizationBatch(params: {
  batchId?: string;
  apply?: boolean;
  policy?: Partial<ArchiveFeatureOptimizationPolicy>;
  searchQueries?: SearchEffectQuery[];
  appliedBy?: string;
} = {}): Promise<ArchiveFeatureBatchReport> {
  const batchId = params.batchId ?? buildBatchId();
  const policy = normalizePolicy(params.policy);
  const mode: ArchiveFeatureBatchMode = params.apply ? "apply" : "dry-run";
  const searchQueries = params.searchQueries ?? DEFAULT_SEARCH_EFFECT_QUERIES;
  const coverageBefore = await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 });
  const planned = await planArchiveFeatureBackfillFromDatabase({ limit: policy.limit });
  const evaluated = planned
    .map((proposal) => evaluateArchiveFeatureCandidate(proposal, { batchId, policy }));
  const persisted = await persistArchiveFeatureCandidates(evaluated);
  const beforeSnapshots = await captureSearchEffectSnapshots(batchId, "before", searchQueries, true);
  const applyCandidates = params.apply
    ? selectArchiveFeatureApplyCandidates(persisted, policy)
    : [];
  const applied = params.apply
    ? await applyArchiveFeatureCandidateBatch(applyCandidates, { appliedBy: params.appliedBy ?? "archive_feature_optimization_loop" })
    : { candidateCount: applyCandidates.length, updatedCount: 0, skippedCount: 0, skippedExistingFeaturePresent: 0 };
  const coverageAfter = params.apply
    ? await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 })
    : coverageBefore;
  const afterSnapshots = params.apply
    ? await captureSearchEffectSnapshots(batchId, "after", searchQueries, true)
    : beforeSnapshots.map((snapshot) => ({ ...snapshot, phase: "after" as const }));
  const report = buildArchiveFeatureBatchReport({
    batchId,
    mode,
    policy,
    coverageBefore,
    coverageAfter,
    candidates: persisted,
    applied,
    beforeSnapshots,
    afterSnapshots,
  });
  await persistArchiveFeatureBatchDecision(report);
  return report;
}

export async function rollbackArchiveFeatureOptimizationBatch(params: {
  batchId: string;
  reason?: string;
  searchQueries?: SearchEffectQuery[];
}): Promise<ArchiveFeatureBatchReport> {
  const policy = normalizePolicy({});
  const coverageBefore = await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 });
  const logs = await prisma.$queryRaw<BackfillLogRow[]>(Prisma.sql`
    select id, candidate_id, archive_item_id, feature_key, before_similarity_features_json
    from agent.archive_feature_backfill_logs
    where batch_id = ${params.batchId}
      and rolled_back_at is null
    order by id desc
  `);
  let updatedCount = 0;
  for (const log of logs) {
    await prisma.$transaction(async (tx) => {
      await tx.contractArchiveItem.update({
        where: { id: BigInt(log.archive_item_id) },
        data: { similarityFeaturesJson: objectRecord(log.before_similarity_features_json) },
      });
      await tx.$executeRaw(Prisma.sql`
        update agent.archive_feature_backfill_logs
        set rolled_back_at = CURRENT_TIMESTAMP,
            rollback_reason = ${params.reason ?? "rollback requested"}
        where id = ${log.id}
      `);
      await tx.$executeRaw(Prisma.sql`
        update agent.archive_feature_backfill_candidates
        set status = 'rolled_back',
            updated_at = CURRENT_TIMESTAMP
        where id = ${log.candidate_id}
      `);
    });
    updatedCount += 1;
  }
  const coverageAfter = await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 });
  const rollbackSnapshots = await captureSearchEffectSnapshots(
    params.batchId,
    "rollback_after",
    params.searchQueries ?? DEFAULT_SEARCH_EFFECT_QUERIES,
    true,
  );
  const report = buildArchiveFeatureBatchReport({
    batchId: params.batchId,
    mode: "rollback",
    policy,
    coverageBefore,
    coverageAfter,
    candidates: [],
    applied: { candidateCount: logs.length, updatedCount, skippedCount: 0, skippedExistingFeaturePresent: 0 },
    beforeSnapshots: rollbackSnapshots,
    afterSnapshots: rollbackSnapshots,
  });
  await persistArchiveFeatureBatchDecision(report);
  return report;
}

export async function verifyArchiveFeatureRollbackBatch(batchId: string): Promise<RollbackVerificationReport> {
  const rows = await prisma.$queryRaw<RollbackVerificationRow[]>(Prisma.sql`
    select
      log.archive_item_id,
      item.similarity_features_json as current_similarity_features_json,
      log.before_similarity_features_json,
      log.rolled_back_at
    from agent.archive_feature_backfill_logs log
    inner join agent.contract_archive_items item on item.id = log.archive_item_id
    where log.batch_id = ${batchId}
    order by log.id asc
  `);
  return buildRollbackVerificationReport(batchId, rows.map((row) => ({
    archiveItemId: stringifyId(row.archive_item_id),
    currentSimilarityFeaturesJson: row.current_similarity_features_json,
    beforeSimilarityFeaturesJson: row.before_similarity_features_json,
    rolledBack: row.rolled_back_at !== null,
  })));
}

export function normalizePolicy(policy: Partial<ArchiveFeatureOptimizationPolicy> = {}): ArchiveFeatureOptimizationPolicy {
  const next = { ...DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY, ...policy };
  return {
    ...next,
    limit: positiveInt(next.limit, DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY.limit),
    minConfidence: boundedNumber(next.minConfidence, 0, 1, DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY.minConfidence),
    maxBatchSize: Math.min(500, positiveInt(next.maxBatchSize, DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY.maxBatchSize)),
    autoApplyMinConfidence: boundedNumber(next.autoApplyMinConfidence, 0, 1, DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY.autoApplyMinConfidence),
    humanReviewMinConfidence: boundedNumber(next.humanReviewMinConfidence, 0, 1, DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY.humanReviewMinConfidence),
  };
}

export function evaluateArchiveFeatureCandidate(
  proposal: ArchiveFeatureBackfillProposal,
  params: { batchId: string; policy?: Partial<ArchiveFeatureOptimizationPolicy> },
): EvaluatedArchiveFeatureCandidate {
  const policy = normalizePolicy(params.policy);
  const riskFlags = candidateRiskFlags(proposal, policy);
  const sourceRoot = sourceFieldRoot(proposal.sourceFieldPath);
  const autoApplyEligible = (
    riskFlags.length === 0
    && proposal.confidence >= policy.autoApplyMinConfidence
    && policy.allowedAutoApplyFeatureKeys.includes(proposal.missingFeatureKey)
    && policy.trustedAutoApplySources.includes(sourceRoot)
  );
  const decision: ArchiveFeatureDecision = riskFlags.includes("excluded_value") || riskFlags.includes("low_confidence")
    ? "reject"
    : autoApplyEligible
      ? "auto_apply"
      : riskFlags.length > 0 || policy.structureFeatureKeys.includes(proposal.missingFeatureKey)
        ? "hold"
        : "human_review";
  const decisionScore = candidateDecisionScore(proposal, riskFlags, policy);
  return {
    ...proposal,
    batchId: params.batchId,
    proposedValueHash: valueHash(proposal.proposedValue),
    decision,
    decisionScore,
    expectedSearchGain: expectedSearchGain(proposal.missingFeatureKey),
    riskFlags,
    status: "pending",
  };
}

export function selectArchiveFeatureApplyCandidates<T extends EvaluatedArchiveFeatureCandidate>(
  candidates: T[],
  policy: ArchiveFeatureOptimizationPolicy = DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY,
): T[] {
  return candidates
    .filter((candidate) => candidate.decision === "auto_apply")
    .slice(0, policy.maxBatchSize);
}

export function candidateRiskFlags(
  proposal: ArchiveFeatureBackfillProposal,
  policy: ArchiveFeatureOptimizationPolicy = DEFAULT_ARCHIVE_FEATURE_OPTIMIZATION_POLICY,
): string[] {
  const flags: string[] = [];
  const value = normalizedValueText(proposal.proposedValue);
  const evidenceText = normalizedValueText(proposal.evidence);
  if (proposal.confidence < policy.humanReviewMinConfidence) flags.push("low_confidence");
  if (policy.excludedValues.map(normalizeRiskText).includes(normalizeRiskText(value))) flags.push("excluded_value");
  if (policy.genericValues.map(normalizeRiskText).includes(normalizeRiskText(value))) flags.push("generic_value");
  if (policy.structureFeatureKeys.includes(proposal.missingFeatureKey) && sourceFieldRoot(proposal.sourceFieldPath) !== "confirmedFieldsJson") {
    flags.push("structure_requires_review");
  }
  if (policy.rejectLowInformationEvidence && evidenceText.length < 2) flags.push("low_information_evidence");
  return uniqueStrings(flags);
}

export function buildArchiveFeatureBatchReport(params: {
  batchId: string;
  mode: ArchiveFeatureBatchMode;
  policy: ArchiveFeatureOptimizationPolicy;
  coverageBefore: ArchiveFeatureCoverageAudit;
  coverageAfter: ArchiveFeatureCoverageAudit;
  candidates: EvaluatedArchiveFeatureCandidate[];
  applied: ApplyArchiveFeatureBatchResult;
  beforeSnapshots: SearchEffectSnapshot[];
  afterSnapshots: SearchEffectSnapshot[];
}): ArchiveFeatureBatchReport {
  const candidateStats = summarizeCandidates(params.candidates);
  const riskSummary = summarizeRisks(params.candidates);
  const searchImpact = computeSearchImpact(params.beforeSnapshots, params.afterSnapshots);
  const funnelDiagnostics = buildFunnelDiagnostics({
    scanCount: params.policy.limit,
    plannerCandidateCount: params.candidates.length,
    insertedCandidateCount: params.candidates.length,
    candidates: params.candidates,
    applied: params.applied,
    policy: params.policy,
  });
  const featureImpact = {
    plannedByFeature: countBy(params.candidates, (candidate) => candidate.missingFeatureKey),
    autoApplyByFeature: countBy(params.candidates.filter((candidate) => candidate.decision === "auto_apply"), (candidate) => candidate.missingFeatureKey),
    humanReviewByFeature: countBy(params.candidates.filter((candidate) => candidate.decision === "human_review"), (candidate) => candidate.missingFeatureKey),
    rejectByFeature: countBy(params.candidates.filter((candidate) => candidate.decision === "reject"), (candidate) => candidate.missingFeatureKey),
  };
  const decision = decideNextAction({
    mode: params.mode,
    candidateStats,
    riskSummary,
    searchImpact,
    applied: params.applied,
  });
  return {
    batchId: params.batchId,
    mode: params.mode,
    policy: params.policy,
    funnelDiagnostics,
    coverageDelta: {
      before: coverageSummary(params.coverageBefore),
      after: coverageSummary(params.coverageAfter),
      deltaMissingByFeature: Object.fromEntries(AUDITED_FEATURE_KEYS.map((key) => [
        key,
        (params.coverageAfter.missing[key as keyof typeof params.coverageAfter.missing] ?? 0)
          - (params.coverageBefore.missing[key as keyof typeof params.coverageBefore.missing] ?? 0),
      ])),
    },
    candidateStats,
    applied: params.applied,
    searchImpact,
    featureImpact,
    riskSummary,
    decision,
  };
}

export function buildFunnelDiagnostics(params: {
  scanCount: number;
  plannerCandidateCount: number;
  insertedCandidateCount: number;
  candidates: EvaluatedArchiveFeatureCandidate[];
  applied: ApplyArchiveFeatureBatchResult;
  policy: ArchiveFeatureOptimizationPolicy;
}): FunnelDiagnostics {
  const eligible = params.candidates.filter((candidate) => candidate.decision === "auto_apply");
  const notAutoApplyEligible = params.candidates.filter((candidate) => (
    candidate.decision !== "auto_apply"
    && !candidate.riskFlags.includes("low_confidence")
    && !candidate.riskFlags.includes("excluded_value")
    && !candidate.riskFlags.includes("generic_value")
    && !candidate.riskFlags.includes("structure_requires_review")
    && AUDITED_FEATURE_KEYS.includes(candidate.missingFeatureKey)
    && sourceIsTrusted(candidate, params.policy)
  )).length;
  return {
    scanCount: params.scanCount,
    plannerCandidateCount: params.plannerCandidateCount,
    insertedCandidateCount: params.insertedCandidateCount,
    eligibleCandidateCount: eligible.length,
    appliedCandidateCount: params.applied.updatedCount,
    filteredOut: {
      lowConfidence: params.candidates.filter((candidate) => candidate.riskFlags.includes("low_confidence")).length,
      genericValue: params.candidates.filter((candidate) => (
        candidate.riskFlags.includes("generic_value") || candidate.riskFlags.includes("excluded_value")
      )).length,
      existingFeaturePresent: params.applied.skippedExistingFeaturePresent,
      unsupportedFeature: params.candidates.filter((candidate) => !AUDITED_FEATURE_KEYS.includes(candidate.missingFeatureKey)).length,
      structureRequiresReview: params.candidates.filter((candidate) => candidate.riskFlags.includes("structure_requires_review")).length,
      unsafeSource: params.candidates.filter((candidate) => !sourceIsTrusted(candidate, params.policy)).length,
      notAutoApplyEligible,
    },
    byFeature: countBy(params.candidates, (candidate) => candidate.missingFeatureKey),
    bySource: countBy(params.candidates, (candidate) => sourceFieldRoot(candidate.sourceFieldPath)),
    byDecision: countBy(params.candidates, (candidate) => candidate.decision),
  };
}

export function buildRollbackVerificationReport(
  batchId: string,
  rows: Array<{
    archiveItemId: string;
    currentSimilarityFeaturesJson: unknown;
    beforeSimilarityFeaturesJson: unknown;
    rolledBack: boolean;
  }>,
): RollbackVerificationReport {
  const items = rows.map((row) => ({
    archiveItemId: row.archiveItemId,
    restored: stableJson(row.currentSimilarityFeaturesJson) === stableJson(row.beforeSimilarityFeaturesJson),
    rolledBack: row.rolledBack,
  }));
  const restoredCount = items.filter((item) => item.restored).length;
  return {
    batchId,
    checkedCount: items.length,
    restoredCount,
    unrestoredCount: items.length - restoredCount,
    restored: items.every((item) => item.restored),
    items,
  };
}

export function summarizeCandidates(candidates: EvaluatedArchiveFeatureCandidate[]) {
  return {
    total: candidates.length,
    autoApply: candidates.filter((candidate) => candidate.decision === "auto_apply").length,
    humanReview: candidates.filter((candidate) => candidate.decision === "human_review").length,
    hold: candidates.filter((candidate) => candidate.decision === "hold").length,
    rejected: candidates.filter((candidate) => candidate.decision === "reject").length,
    byFeature: countBy(candidates, (candidate) => candidate.missingFeatureKey),
    byDecision: countBy(candidates, (candidate) => candidate.decision),
    bySource: countBy(candidates, (candidate) => sourceFieldRoot(candidate.sourceFieldPath)),
  };
}

export function summarizeRisks(candidates: EvaluatedArchiveFeatureCandidate[]) {
  const riskCandidates = candidates.filter((candidate) => candidate.riskFlags.length > 0);
  return {
    riskCandidateCount: riskCandidates.length,
    riskCandidateRatio: candidates.length === 0 ? 0 : round(riskCandidates.length / candidates.length),
    byRiskFlag: countBy(riskCandidates.flatMap((candidate) => candidate.riskFlags), (flag) => flag),
    byFeature: countBy(riskCandidates, (candidate) => candidate.missingFeatureKey),
  };
}

export function computeSearchImpact(before: SearchEffectSnapshot[], after: SearchEffectSnapshot[]) {
  const beforeMetrics = aggregateSearchMetrics(before);
  const afterMetrics = aggregateSearchMetrics(after);
  return {
    before: beforeMetrics,
    after: afterMetrics,
    delta: {
      averageTop1Score: round(afterMetrics.averageTop1Score - beforeMetrics.averageTop1Score),
      averageTop5Score: round(afterMetrics.averageTop5Score - beforeMetrics.averageTop5Score),
      explanationCount: afterMetrics.explanationCount - beforeMetrics.explanationCount,
      structureExplanationCount: afterMetrics.structureExplanationCount - beforeMetrics.structureExplanationCount,
    },
  };
}

async function persistArchiveFeatureCandidates(candidates: EvaluatedArchiveFeatureCandidate[]): Promise<PersistedArchiveFeatureCandidate[]> {
  const persisted: PersistedArchiveFeatureCandidate[] = [];
  for (const candidate of candidates) {
    const rows = await prisma.$queryRaw<CandidateDbRow[]>(Prisma.sql`
      insert into agent.archive_feature_backfill_candidates (
        batch_id,
        archive_item_id,
        feature_key,
        proposed_value_json,
        proposed_value_hash,
        source_term_type,
        source_field_path,
        confidence,
        evidence_json,
        risk_flags_json,
        decision,
        decision_score,
        expected_search_gain,
        status
      )
      values (
        ${candidate.batchId},
        ${BigInt(candidate.archiveItemId)},
        ${candidate.missingFeatureKey},
        ${JSON.stringify(candidate.proposedValue)}::jsonb,
        ${candidate.proposedValueHash},
        ${candidate.sourceTermType},
        ${candidate.sourceFieldPath},
        ${candidate.confidence},
        ${JSON.stringify(candidate.evidence ?? {})}::jsonb,
        ${JSON.stringify(candidate.riskFlags)}::jsonb,
        ${candidate.decision},
        ${candidate.decisionScore},
        ${candidate.expectedSearchGain},
        ${candidate.status}
      )
      on conflict (archive_item_id, feature_key, proposed_value_hash)
      do update set
        batch_id = excluded.batch_id,
        source_term_type = excluded.source_term_type,
        source_field_path = excluded.source_field_path,
        confidence = excluded.confidence,
        evidence_json = excluded.evidence_json,
        risk_flags_json = excluded.risk_flags_json,
        decision = excluded.decision,
        decision_score = excluded.decision_score,
        expected_search_gain = excluded.expected_search_gain,
        updated_at = CURRENT_TIMESTAMP
      returning id
    `);
    const id = rows[0]?.id;
    if (id !== undefined) persisted.push({ ...candidate, candidateId: stringifyId(id) });
  }
  return persisted;
}

async function applyArchiveFeatureCandidateBatch(
  candidates: PersistedArchiveFeatureCandidate[],
  params: { appliedBy: string },
): Promise<ApplyArchiveFeatureBatchResult> {
  let updatedCount = 0;
  let skippedCount = 0;
  let skippedExistingFeaturePresent = 0;
  for (const candidate of candidates) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.contractArchiveItem.findUnique({
        where: { id: BigInt(candidate.archiveItemId) },
        select: { similarityFeaturesJson: true, updatedAt: true },
      });
      if (!current) {
        skippedCount += 1;
        return;
      }
      const before = objectRecord(current.similarityFeaturesJson);
      if (hasValue(before[candidate.missingFeatureKey])) {
        skippedCount += 1;
        skippedExistingFeaturePresent += 1;
        await tx.$executeRaw(Prisma.sql`
          update agent.archive_feature_backfill_candidates
          set status = 'skipped',
              updated_at = CURRENT_TIMESTAMP
          where id = ${BigInt(candidate.candidateId)}
        `);
        return;
      }
      const after = { ...before, [candidate.missingFeatureKey]: candidate.proposedValue };
      await tx.$executeRaw(Prisma.sql`
        update agent.contract_archive_items
        set similarity_features_json = ${JSON.stringify(after)}::jsonb
        where id = ${BigInt(candidate.archiveItemId)}
      `);
      await tx.$executeRaw(Prisma.sql`
        insert into agent.archive_feature_backfill_logs (
          batch_id,
          candidate_id,
          archive_item_id,
          feature_key,
          before_similarity_features_json,
          after_similarity_features_json,
          applied_by
        )
        values (
          ${candidate.batchId},
          ${BigInt(candidate.candidateId)},
          ${BigInt(candidate.archiveItemId)},
          ${candidate.missingFeatureKey},
          ${JSON.stringify(before)}::jsonb,
          ${JSON.stringify(after)}::jsonb,
          ${params.appliedBy}
        )
        on conflict (candidate_id) do nothing
      `);
      await tx.$executeRaw(Prisma.sql`
        update agent.archive_feature_backfill_candidates
        set status = 'applied',
            updated_at = CURRENT_TIMESTAMP
        where id = ${BigInt(candidate.candidateId)}
      `);
      updatedCount += 1;
    });
  }
  return { candidateCount: candidates.length, updatedCount, skippedCount, skippedExistingFeaturePresent };
}

async function captureSearchEffectSnapshots(
  batchId: string,
  phase: SearchEffectSnapshot["phase"],
  queries: SearchEffectQuery[],
  persist: boolean,
): Promise<SearchEffectSnapshot[]> {
  const snapshots: SearchEffectSnapshot[] = [];
  for (const query of queries) {
    const response = await archiveItemSearchService.searchArchiveItems({ ...query, limit: 5 });
    const topResults = response.results.slice(0, 5).map(summarizeSearchResult);
    const snapshot = {
      phase,
      query,
      topResults,
      metrics: searchEffectMetrics(response.results.slice(0, 5)),
    };
    snapshots.push(snapshot);
    if (persist) {
      await prisma.$executeRaw(Prisma.sql`
        insert into agent.archive_search_effect_snapshots (
          batch_id,
          phase,
          query_text,
          query_json,
          top_results_json,
          metrics_json
        )
        values (
          ${batchId},
          ${phase},
          ${query.queryText},
          ${JSON.stringify(query)}::jsonb,
          ${JSON.stringify(topResults)}::jsonb,
          ${JSON.stringify(snapshot.metrics)}::jsonb
        )
      `);
    }
  }
  return snapshots;
}

async function persistArchiveFeatureBatchDecision(report: ArchiveFeatureBatchReport) {
  await prisma.$executeRaw(Prisma.sql`
    insert into agent.archive_feature_batch_decisions (
      batch_id,
      mode,
      policy_json,
      coverage_before_json,
      coverage_after_json,
      candidate_stats_json,
      search_impact_json,
      risk_summary_json,
      decision_json,
      report_json
    )
    values (
      ${report.batchId},
      ${report.mode},
      ${JSON.stringify(report.policy)}::jsonb,
      ${JSON.stringify(report.coverageDelta.before)}::jsonb,
      ${JSON.stringify(report.coverageDelta.after)}::jsonb,
      ${JSON.stringify(report.candidateStats)}::jsonb,
      ${JSON.stringify(report.searchImpact)}::jsonb,
      ${JSON.stringify(report.riskSummary)}::jsonb,
      ${JSON.stringify(report.decision)}::jsonb,
      ${JSON.stringify(report, bigintReplacer)}::jsonb
    )
    on conflict (batch_id)
    do update set
      mode = excluded.mode,
      policy_json = excluded.policy_json,
      coverage_before_json = excluded.coverage_before_json,
      coverage_after_json = excluded.coverage_after_json,
      candidate_stats_json = excluded.candidate_stats_json,
      search_impact_json = excluded.search_impact_json,
      risk_summary_json = excluded.risk_summary_json,
      decision_json = excluded.decision_json,
      report_json = excluded.report_json,
      updated_at = CURRENT_TIMESTAMP
  `);
}

function decideNextAction(params: {
  mode: ArchiveFeatureBatchMode;
  candidateStats: ReturnType<typeof summarizeCandidates>;
  riskSummary: ReturnType<typeof summarizeRisks>;
  searchImpact: ReturnType<typeof computeSearchImpact>;
  applied: ApplyArchiveFeatureBatchResult;
}): ArchiveFeatureBatchReport["decision"] {
  if (params.mode === "rollback") {
    return {
      action: "hold",
      owner: "system",
      requiresHumanApproval: true,
      confidence: 0.8,
      reasons: ["rollback completed; review next policy before continuing"],
    };
  }
  if (params.searchImpact.delta.averageTop1Score < -0.05 || params.searchImpact.delta.explanationCount < -2) {
    return {
      action: "rollback",
      owner: "system",
      requiresHumanApproval: true,
      confidence: 0.85,
      reasons: ["search quality regression detected"],
    };
  }
  if (params.riskSummary.riskCandidateRatio > 0.35) {
    return {
      action: "adjust",
      owner: "system",
      requiresHumanApproval: true,
      confidence: 0.78,
      reasons: ["risk candidate ratio is high; adjust filters before increasing automation"],
    };
  }
  if (params.candidateStats.autoApply > 0 || params.applied.updatedCount > 0) {
    return {
      action: "continue",
      owner: "system",
      requiresHumanApproval: params.mode !== "dry-run",
      confidence: 0.82,
      reasons: ["eligible low-risk candidates found and no search regression detected"],
    };
  }
  return {
    action: "hold",
    owner: "system",
    requiresHumanApproval: true,
    confidence: 0.7,
    reasons: ["no auto-apply candidates under current policy"],
  };
}

function searchEffectMetrics(results: ArchiveItemSearchResult[]): SearchEffectMetrics {
  const top5 = results.slice(0, 5);
  return {
    resultCount: top5.length,
    top1Score: top5[0]?.similarityScore ?? 0,
    top5AverageScore: top5.length === 0 ? 0 : round(top5.reduce((sum, result) => sum + result.similarityScore, 0) / top5.length),
    productTypeExplanationCount: top5.filter((result) => hasReason(result, "产品类型匹配")).length,
    materialExplanationCount: top5.filter((result) => hasReason(result, "材料匹配")).length,
    widthExplanationCount: top5.filter((result) => hasReason(result, "宽度接近")).length,
    applicationExplanationCount: top5.filter((result) => hasReason(result, "应用匹配")).length,
    lipAdjustmentExplanationCount: top5.filter((result) => hasReason(result, "模唇调节方式匹配")).length,
    deckleExplanationCount: top5.filter((result) => hasReason(result, "堵边/调幅结构匹配")).length,
  };
}

function summarizeSearchResult(result: ArchiveItemSearchResult) {
  return {
    archiveItemId: result.archiveItemId,
    archiveId: result.archiveId,
    itemName: result.itemName,
    score: result.similarityScore,
    matchReasons: result.matchReasons,
    explainability: {
      productType: hasReason(result, "产品类型匹配"),
      material: hasReason(result, "材料匹配"),
      width: hasReason(result, "宽度接近"),
      application: hasReason(result, "应用匹配"),
      lipAdjustmentMethod: hasReason(result, "模唇调节方式匹配"),
      deckleType: hasReason(result, "堵边/调幅结构匹配"),
    },
  };
}

function aggregateSearchMetrics(snapshots: SearchEffectSnapshot[]) {
  const count = Math.max(1, snapshots.length);
  const explanationCount = snapshots.reduce((sum, snapshot) => (
    sum
    + snapshot.metrics.productTypeExplanationCount
    + snapshot.metrics.materialExplanationCount
    + snapshot.metrics.widthExplanationCount
    + snapshot.metrics.applicationExplanationCount
  ), 0);
  const structureExplanationCount = snapshots.reduce((sum, snapshot) => (
    sum + snapshot.metrics.lipAdjustmentExplanationCount + snapshot.metrics.deckleExplanationCount
  ), 0);
  return {
    averageTop1Score: round(snapshots.reduce((sum, snapshot) => sum + snapshot.metrics.top1Score, 0) / count),
    averageTop5Score: round(snapshots.reduce((sum, snapshot) => sum + snapshot.metrics.top5AverageScore, 0) / count),
    explanationCount,
    structureExplanationCount,
  };
}

function coverageSummary(audit: ArchiveFeatureCoverageAudit): CoverageSummary {
  return {
    totalArchives: audit.totalArchives,
    totalArchiveItems: audit.totalArchiveItems,
    archivesWithSimilarityFeatures: audit.archivesWithSimilarityFeatures,
    archivesMissingSimilarityFeatures: audit.archivesMissingSimilarityFeatures,
    archivesMissingConfirmedSimilarityFeatures: audit.archivesMissingConfirmedSimilarityFeatures,
    missingByFeature: Object.fromEntries(AUDITED_FEATURE_KEYS.map((key) => [key, audit.missing[key as keyof typeof audit.missing] ?? 0])),
    recoverableByFeature: Object.fromEntries(AUDITED_FEATURE_KEYS.map((key) => [key, audit.recoverable[key as keyof typeof audit.recoverable] ?? 0])),
  };
}

type CoverageSummary = {
  totalArchives: number;
  totalArchiveItems: number;
  archivesWithSimilarityFeatures: number;
  archivesMissingSimilarityFeatures: number;
  archivesMissingConfirmedSimilarityFeatures: number;
  missingByFeature: Record<string, number>;
  recoverableByFeature: Record<string, number>;
};

function candidateDecisionScore(
  proposal: ArchiveFeatureBackfillProposal,
  riskFlags: string[],
  policy: ArchiveFeatureOptimizationPolicy,
) {
  const sourceBonus = policy.trustedAutoApplySources.includes(sourceFieldRoot(proposal.sourceFieldPath)) ? 0.08 : 0;
  const structurePenalty = policy.structureFeatureKeys.includes(proposal.missingFeatureKey) ? 0.08 : 0;
  const riskPenalty = riskFlags.length * 0.12;
  return round(Math.max(0, Math.min(1, proposal.confidence + sourceBonus - structurePenalty - riskPenalty)));
}

function sourceIsTrusted(candidate: EvaluatedArchiveFeatureCandidate, policy: ArchiveFeatureOptimizationPolicy): boolean {
  return policy.trustedAutoApplySources.includes(sourceFieldRoot(candidate.sourceFieldPath));
}

function expectedSearchGain(featureKey: string): number {
  const weights: Record<string, number> = {
    product_type: 0.2,
    effective_width_mm: 0.2,
    die_width_mm: 0.16,
    plastic_material: 0.18,
    application: 0.14,
    lip_adjustment_method: 0.08,
    deckle_type: 0.08,
    thickness_mm: 0.04,
  };
  return weights[featureKey] ?? 0.02;
}

function hasReason(result: ArchiveItemSearchResult, text: string): boolean {
  return result.matchReasons.some((reason) => reason.includes(text));
}

function sourceFieldRoot(value: string): string {
  return value.split(/[.[\]]/).filter(Boolean)[0] ?? value;
}

function normalizedValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeRiskText(value: string): string {
  return value.trim().toLowerCase();
}

function valueHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  return true;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, sortJson(item)]));
}

function positiveInt(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function stringifyId(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value ?? "");
}

function buildBatchId(): string {
  return `archive-feature-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
