import { apiClient } from "@/api/http/client";
import type { BatchReviewOptions, BatchReviewResponse, ReviewOperation } from "../../types";
import type {
  ConceptActionResult,
  ConceptPatternReview,
  ConceptResolution,
  ConceptResolverRun,
  TargetHealthReport,
} from "../types";

const unwrap = <T>(response: { data: T }) => response.data;
const slowRequest = { timeout: 120000 };
const defaultReviewer = "Codex";

const withReviewer = (operation: ReviewOperation): ReviewOperation => ({
  ...operation,
  payload: {
    reviewedBy: defaultReviewer,
    ...operation.payload,
  },
});

export const conceptResolverService = {
  async listPatterns(params: { status?: string; limit?: number }): Promise<{ patterns: ConceptPatternReview[] }> {
    return unwrap(await apiClient.get("/productConfigAgent/concept-resolver/patterns", { params, ...slowRequest }));
  },

  async reviewPattern(
    patternKey: string,
    body: {
      status?: string;
      reviewedBy?: string;
      reviewPayload?: Record<string, unknown>;
    },
  ): Promise<{ review: ConceptPatternReview }> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/concept-resolver/patterns/${encodeURIComponent(patternKey)}/review`,
        { patternKey, ...body },
        slowRequest,
      ),
    );
  },

  async applyPatternCandidates(
    patternKey: string,
    body: { reviewedBy?: string; limit?: number },
  ): Promise<ConceptActionResult> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/concept-resolver/patterns/${encodeURIComponent(patternKey)}/apply-candidates`,
        { patternKey, ...body },
        slowRequest,
      ),
    );
  },

  async listResolutions(params: {
    route?: string;
    relationType?: string;
    candidateType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ resolutions: ConceptResolution[] }> {
    return unwrap(await apiClient.get("/productConfigAgent/concept-resolver/resolutions", { params, ...slowRequest }));
  },

  async listHealthReports(params: {
    targetKind?: string;
    targetIds?: Array<string | number>;
    label?: string;
    minRiskScore?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: TargetHealthReport[]; limit?: number; offset?: number }> {
    return unwrap(await apiClient.get("/productConfigAgent/dictionary/health-report", { params, ...slowRequest }));
  },

  async startHealthAuditJob(body: {
    targetKind?: string;
    targetIds?: Array<string | number>;
    limit?: number;
    dryRun?: boolean;
  } = {}): Promise<{ job: Record<string, any> }> {
    return unwrap(await apiClient.post("/productConfigAgent/dictionary/health-audit/jobs", {
      targetKind: "all",
      targetIds: [],
      limit: 10000,
      dryRun: false,
      ...body,
    }, slowRequest));
  },

  async getBackgroundJob(jobId: string | number): Promise<{ job: Record<string, any> }> {
    return unwrap(await apiClient.get(`/productConfigAgent/background-jobs/${encodeURIComponent(String(jobId))}`, slowRequest));
  },

  async submitBatchReviews(
    operations: ReviewOperation[],
    options: BatchReviewOptions = { deferCandidateRecheck: true },
  ): Promise<BatchReviewResponse> {
    return unwrap(
      await apiClient.post("/productConfigAgent/candidates/reviews/batch", {
        ...options,
        operations: operations.map(withReviewer),
      }, slowRequest),
    );
  },

  async getRun(runId: string | number): Promise<{ run: ConceptResolverRun }> {
    return unwrap(await apiClient.get(`/productConfigAgent/concept-resolver/runs/${encodeURIComponent(String(runId))}`, slowRequest));
  },

  async runDryResolver(body: {
    candidateType?: "all" | "term_type" | "value";
    status?: string;
    limit?: number;
    apply?: boolean;
  }): Promise<{ run: ConceptResolverRun }> {
    return unwrap(await apiClient.post("/productConfigAgent/concept-resolver/run", { ...body, apply: false }, slowRequest));
  },
};
