import { z } from "zod";
import { classifyFields, protectAuditValue } from "../../../ai/audit/dataProtection.js";
import { requestDeepSeekJson, type LlmChatMessage } from "../../../ai/llm/deepseekClient.js";
import type { DiagnosticPlanCorrection } from "../diagnostic/index.js";
import type {
  ComplexQueryComposedResult,
  ComplexQueryPlan,
  ComplexQueryReviewedAnalysis,
  ComplexQueryStepResult,
} from "./types.js";

export type ComplexQueryAnalysisInput = {
  question: string;
  plan: ComplexQueryPlan;
  steps: ComplexQueryStepResult[];
  composed: ComplexQueryComposedResult;
  planCorrections?: DiagnosticPlanCorrection[];
  signal?: AbortSignal;
};

export type ComplexQueryAnalysisRequester = (params: {
  purpose: string;
  messages: LlmChatMessage[];
  input: unknown;
  maxTokens: number;
  responseFormat: "json_object";
  signal?: AbortSignal;
}) => Promise<string>;

const AnalysisSchema = z.object({
  summary: z.string().trim().min(1),
  highlights: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
});

const ReviewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved"), issues: z.array(z.string()).default([]) }).strict(),
  z.object({ status: z.literal("revised"), issues: z.array(z.string()).default([]), revised: AnalysisSchema }).strict(),
  z.object({ status: z.literal("rejected"), issues: z.array(z.string()).default([]) }).strict(),
]);

const TimeRangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current_year") }).strict(),
  z.object({ kind: z.literal("current_year_first_half") }).strict(),
  z.object({ kind: z.literal("year_over_year") }).strict(),
  z.object({ kind: z.literal("current_month") }).strict(),
  z.object({ kind: z.literal("previous_month") }).strict(),
  z.object({ kind: z.literal("month"), month: z.number().int().min(1).max(12).optional() }).strict(),
  z.object({ kind: z.literal("relative"), days: z.number().int().positive().optional() }).strict(),
]);
const MarginFilterSchema = z.object({
  metric: z.literal("gross_margin_rate"),
  op: z.enum(["rank_high", "rank_low", "high", "low", "overdue", "lt"]),
  value: z.number().optional(),
}).strict();
const DiagnosticPlanCorrectionsSchema = z.array(z.discriminatedUnion("field", [
  z.object({ field: z.literal("timeRange"), before: TimeRangeSchema.optional(), after: TimeRangeSchema, sourceText: z.string() }).strict(),
  z.object({ field: z.literal("filters.gross_margin_rate"), before: z.array(MarginFilterSchema), after: MarginFilterSchema, sourceText: z.string() }).strict(),
  z.object({ field: z.literal("limit"), before: z.number().int().optional(), after: z.number().int().min(1).max(500), sourceText: z.string() }).strict(),
]));

const ANALYST_PROMPT = [
  "You are the Analyst: only use supplied results; cite step/field evidence; never infer missing causes.",
  "Never generate SQL and never call or propose tools.",
  "Return JSON only: summary, highlights, caveats.",
].join("\n");

const REVIEWER_PROMPT = [
  "You are the Reviewer. Check every claim against the supplied evidence and identify evidence gaps.",
  "Never generate SQL and never call or propose tools.",
  'Approved JSON exactly: {"status":"approved","issues":[]}',
  'Revised JSON exactly: {"status":"revised","issues":[],"revised":{"summary":"...","highlights":[],"caveats":[]}}',
  'Rejected JSON exactly: {"status":"rejected","issues":[]}',
].join("\n");

const REVIEW_OUTPUT_SHAPES = {
  approved: { status: "approved", issues: [] },
  revised: { status: "revised", issues: [], revised: { summary: "string", highlights: [], caveats: [] } },
  rejected: { status: "rejected", issues: [] },
} as const;

export class ComplexQueryAnalysisService {
  constructor(private readonly requestJson: ComplexQueryAnalysisRequester = (params) => requestDeepSeekJson(params)) {}

  async analyze(input: ComplexQueryAnalysisInput): Promise<ComplexQueryReviewedAnalysis> {
    const planCorrections = DiagnosticPlanCorrectionsSchema.parse(input.planCorrections ?? []);
    const fallback = deterministicAnalysis(input);
    if (!externalAnalysisEnabled()) return {
      ...fallback,
      caveats: [...fallback.caveats, "外部复合分析默认关闭，未发送 ERP 行数据。"],
    };

    const rawRowsSent = externalRawRowsEnabled();
    const evidence = protectedEvidence(input, rawRowsSent);
    let analysis = fallback;
    let analystFailed = false;
    try {
      const content = await this.requestJson({
        purpose: "erp_complex_query_analyst",
        input: evidence,
        maxTokens: 1200,
        responseFormat: "json_object",
        signal: input.signal,
        messages: [
          { role: "system", content: ANALYST_PROMPT },
          { role: "user", content: JSON.stringify({ intent: safeIntent(input), evidence, outputShape: { summary: "string", highlights: "string[]", caveats: "string[]" } }) },
        ],
      });
      const parsed = AnalysisSchema.parse(JSON.parse(content));
      analysis = {
        ...parsed,
        caveats: [...new Set([...parsed.caveats, ...fallback.caveats])],
        review: fallback.review,
        audit: fallback.audit,
      };
    } catch {
      analystFailed = true;
    }

    try {
      const reviewContext = { ...reviewerContext(input, analysis, planCorrections), outputShapes: REVIEW_OUTPUT_SHAPES };
      const content = await this.requestJson({
        purpose: "erp_complex_query_reviewer",
        input: reviewContext,
        maxTokens: 1200,
        responseFormat: "json_object",
        signal: input.signal,
        messages: [
          { role: "system", content: REVIEWER_PROMPT },
          { role: "user", content: JSON.stringify(reviewContext) },
        ],
      });
      const review = ReviewSchema.parse(JSON.parse(content));
      return reviewedResult(fallback, analysis, review, rawRowsSent);
    } catch {
      const caveats = [...fallback.caveats, analystFailed ? "complex_analysis_llm_failed" : "complex_analysis_review_failed"];
      return {
        ...fallback,
        caveats: [...new Set(caveats)],
        review: { status: "rejected", issues: [analystFailed ? "complex_analysis_llm_failed" : "complex_analysis_review_failed"] },
        audit: { externalDataSent: true, externalRawRowsSent: rawRowsSent },
      };
    }
  }
}

function deterministicAnalysis(input: ComplexQueryAnalysisInput): ComplexQueryReviewedAnalysis {
  const usable = input.steps.filter((step) => ["completed", "partial"].includes(step.status));
  const coverage = input.composed.joinCoverage.map((item) => `${item.stepId} ${item.matchedRows}/${item.anchorRows}`).join("，") || "无依赖步骤";
  const failures = input.steps.filter((step) => !["completed", "partial"].includes(step.status));
  const unmatched = input.composed.joinCoverage.filter((item) => item.unmatchedRows > 0);
  const caveats = [
    ...failures.map((step) => `步骤 ${step.id} 未完成（${step.status}）。`),
    ...unmatched.map((item) => `步骤 ${item.stepId} 有 ${item.unmatchedRows} 行未按精确键 ${item.keys.join("+")} 匹配。`),
    ...input.composed.warnings,
  ];
  return {
    summary: `已组合 ${usable.length}/${input.steps.length} 个可用步骤，返回 ${input.composed.rowCount} 行；匹配覆盖：${coverage}。`,
    highlights: [],
    caveats: [...new Set(caveats)],
    review: { status: "approved", issues: [] },
    audit: { externalDataSent: false, externalRawRowsSent: false },
  };
}

function protectedEvidence(input: ComplexQueryAnalysisInput, rawRowsSent: boolean) {
  return {
    intent: safeIntent(input),
    steps: input.steps.map((step) => ({ id: step.id, status: step.status, rowCount: step.rowCount, fields: fieldEvidence(step.fields), warnings: protectAuditValue(step.warnings, "warnings") })),
    composed: {
      rowCount: input.composed.rowCount,
      truncated: input.composed.truncated,
      warnings: protectAuditValue(input.composed.warnings, "warnings"),
      fieldCategories: classifyFields(input.composed.fields),
      aggregates: aggregateRows(input.composed.fields, input.composed.rows),
      joinCoverage: input.composed.joinCoverage,
      ...(rawRowsSent ? { fields: input.composed.fields, rows: input.composed.rows } : {}),
    },
    external_data_sent: true,
    raw_rows_sent: rawRowsSent,
  };
}

function reviewerContext(
  input: ComplexQueryAnalysisInput,
  analyst: ComplexQueryReviewedAnalysis,
  planCorrections: z.infer<typeof DiagnosticPlanCorrectionsSchema>,
) {
  return {
    intent: safeIntent(input),
    analyst: { summary: analyst.summary, highlights: analyst.highlights, caveats: analyst.caveats },
    planCorrections: planCorrections.map(({ sourceText, ...correction }) => ({
      ...correction,
      sourceText: protectAuditValue(sourceText, "content"),
    })),
    steps: input.steps.map(({ id, status, rowCount, error }) => ({ id, status, rowCount, ...(error ? { error: protectFreeText(error) } : {}) })),
    coverage: input.composed.joinCoverage,
    warnings: protectAuditValue(input.composed.warnings, "warnings"),
  };
}

function safeIntent(input: ComplexQueryAnalysisInput) {
  return {
    scenario: input.plan.scenario,
    modules: [...new Set(input.plan.steps.map((step) => step.module))],
    metrics: [...new Set(input.plan.steps.flatMap((step) => step.metrics))],
    dimensions: [...new Set(input.plan.steps.flatMap((step) => step.dimensions))],
  };
}

function reviewedResult(
  fallback: ComplexQueryReviewedAnalysis,
  analysis: ComplexQueryReviewedAnalysis,
  review: z.infer<typeof ReviewSchema>,
  rawRowsSent: boolean,
): ComplexQueryReviewedAnalysis {
  if (review.status === "rejected") {
    return {
      ...fallback,
      highlights: [],
      caveats: [...new Set([...fallback.caveats, "Reviewer rejected analysis due to evidence gap."])],
      review: { status: "rejected", issues: review.issues },
      audit: { externalDataSent: true, externalRawRowsSent: rawRowsSent },
    };
  }
  return {
    ...(review.status === "revised"
      ? { ...review.revised, caveats: [...new Set([...review.revised.caveats, ...analysis.caveats])] }
      : analysis),
    review: { status: review.status, issues: review.issues },
    audit: { externalDataSent: true, externalRawRowsSent: rawRowsSent },
  };
}

function protectFreeText(value: unknown): unknown {
  return typeof value === "string" ? protectAuditValue(value, "content") : protectAuditValue(value, "value");
}

function fieldEvidence(fields: string[]) {
  return fields.map((field) => ({ category: classifyFields([field])[0] }));
}

function aggregateRows(fields: string[], rows: unknown[][]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field, index) => {
    const values = rows.map((row) => row[index]).filter((value) => value !== null && value !== undefined);
    const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return [`field_${index}`, numbers.length === values.length && numbers.length > 0
      ? { category: classifyFields([field])[0], type: "number", count: numbers.length, min: Math.min(...numbers), max: Math.max(...numbers), average: numbers.reduce((sum, value) => sum + value, 0) / numbers.length }
      : { category: classifyFields([field])[0], type: "redacted", count: values.length }];
  }));
}

function externalAnalysisEnabled(): boolean {
  return process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED === "true"
    && process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED === "true";
}

function externalRawRowsEnabled(): boolean {
  return externalAnalysisEnabled() && process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED === "true";
}
