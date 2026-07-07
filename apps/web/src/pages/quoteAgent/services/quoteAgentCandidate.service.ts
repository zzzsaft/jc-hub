import { apiClient } from "@/api/http/client";
import type {
  BatchReviewOptions,
  BatchReviewResponse,
  CandidateClusterFilters,
  CandidateClusterReviewPromptResponse,
  CandidateClustersResponse,
  CandidateStatus,
  CandidatesResponse,
  ReviewOperation,
  SplitTermTypeCandidatePayload,
  UnitAliasPayload,
  UnitCandidate,
  UnitCandidateReviewPromptResponse,
  UnitCandidatesResponse,
} from "../types";
import {
  defaultReviewer,
  slowRequest,
  unitCandidatesFromResponse,
  unwrap,
  withReviewer,
} from "./quoteAgent.service.utils";

export const quoteAgentCandidateService = {
  async getCandidates(params: {
    status: CandidateStatus;
    documentId?: string | number;
    recheckPendingCandidates?: boolean;
  }): Promise<CandidatesResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates", { params, ...slowRequest }));
  },

  async getUnitCandidates(params: { status: CandidateStatus }): Promise<UnitCandidate[]> {
    return unitCandidatesFromResponse(
      unwrap(
        await apiClient.get<UnitCandidatesResponse | UnitCandidate[]>("/productConfigAgent/candidates/units", {
          params,
          ...slowRequest,
        }),
      ),
    );
  },

  async approveUnitCandidate(candidateId: string | number, payload: UnitAliasPayload): Promise<unknown> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/candidates/units/${encodeURIComponent(String(candidateId))}/approve`,
        payload,
        slowRequest,
      ),
    );
  },

  async rejectUnitCandidate(
    candidateId: string | number,
    payload: { reason?: string; reviewedBy?: string } = { reviewedBy: defaultReviewer },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/candidates/units/${encodeURIComponent(String(candidateId))}/reject`,
        payload,
        slowRequest,
      ),
    );
  },

  async getUnitCandidateReviewPrompt(): Promise<UnitCandidateReviewPromptResponse | string> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/units/review-prompt", slowRequest));
  },

  async getCandidateClusterReviewPrompt(): Promise<CandidateClusterReviewPromptResponse | string> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/clusters/review-prompt", slowRequest));
  },

  async getCandidateClusters(params: CandidateClusterFilters): Promise<CandidateClustersResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/clusters", { params, ...slowRequest }));
  },

  async suggestCandidateClusterReviewsBatch(params: {
    clusterIds?: Array<string | number>;
    status?: CandidateStatus;
    model?: string;
    priorDecisions?: unknown[];
    runPolicy?: Record<string, unknown>;
  }): Promise<unknown> {
    return unwrap(await apiClient.post("/productConfigAgent/candidates/clusters/suggestions/batch", params, slowRequest));
  },

  async suggestTermTypeCandidate(
    candidateId: string | number,
    params?: { model?: string; force?: boolean },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/term-type/${candidateId}/suggest`, params ?? {}, slowRequest),
    );
  },

  async splitTermTypeCandidate(
    candidateId: string | number,
    payload: SplitTermTypeCandidatePayload,
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/term-type/${candidateId}/split`, payload, slowRequest),
    );
  },

  async suggestValueSplit(
    candidateId: string | number,
    params?: { model?: string; force?: boolean },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/value/${candidateId}/split-suggest`, params ?? {}, slowRequest),
    );
  },

  async suggestCandidateReviewsBatch(params: {
    status?: CandidateStatus;
    documentId?: string | number;
    model?: string;
    force?: boolean;
  }): Promise<unknown> {
    return unwrap(await apiClient.post("/productConfigAgent/candidates/suggestions/batch", params, slowRequest));
  },

  async submitReview(operation: ReviewOperation): Promise<unknown> {
    return this.submitBatchReviews([operation]);
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
};
