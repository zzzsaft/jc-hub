import type { CandidateType } from "./status.types";

export type ReviewAction =
  | "create_term_type"
  | "approve_term_type_as_alias"
  | "split_term_type"
  | "create_value"
  | "approve_value_as_alias"
  | "split_value"
  | "move_value_to_other_term_type"
  | "update_term_type_value_kind"
  | "reject";

export interface ReviewOperation {
  candidateType: CandidateType;
  candidateId: string;
  action: ReviewAction;
  payload: Record<string, unknown>;
}

export interface BatchReviewOptions {
  refreshAffectedDocuments?: boolean;
  deferCandidateRecheck?: boolean;
}

export interface BatchReviewResponse {
  successCount?: number;
  failedCount?: number;
  affectedDocumentIds?: Array<string | number>;
  candidateRecheckDeferred?: boolean;
  failures?: Array<Record<string, any>>;
  failedOperations?: Array<Record<string, any>>;
  results?: Array<Record<string, any>>;
  [key: string]: unknown;
}

export interface TermTypeSplitItem {
  termType: string;
  displayName?: string;
  valueKind?: string;
  rawValue?: string;
  aliasNames?: string[];
  canonicalValue?: string;
}

export interface SplitTermTypeCandidatePayload {
  refreshAffectedDocuments?: boolean;
  splits: TermTypeSplitItem[];
}

export type RenormalizeBatchScope = "all" | "missing_normalized" | "with_pending_candidates";

export interface RenormalizeBatchParams {
  scope: RenormalizeBatchScope;
  limit?: number;
  batchSize?: number;
}

export interface RenormalizeBatchResponse {
  scope?: RenormalizeBatchScope;
  requestedLimit?: number | null;
  batchSize?: number;
  onlyMissingNormalized?: boolean;
  withPendingCandidates?: boolean;
  processedCount?: number;
  successCount?: number;
  failedCount?: number;
  failedResults?: Array<Record<string, any>>;
  resultPreview?: Array<Record<string, any>>;
  [key: string]: unknown;
}

export interface ReviewDraft extends ReviewOperation {
  label: string;
  updatedAt: number;
}
