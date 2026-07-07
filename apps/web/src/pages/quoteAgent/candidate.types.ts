import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "./dictionary.types";
import type { ReviewAction, ReviewOperation } from "./review.types";
import type { CandidateStatus, CandidateType } from "./status.types";

export interface Candidate {
  id: string | number;
  status?: CandidateStatus | string;
  candidateType?: CandidateType;
  rawFieldName?: string;
  rawValue?: string;
  termType?: string;
  reason?: string;
  evidence?: Record<string, any> | null;
  documentId?: number | string;
  extractionResultId?: number | string;
  itemIndex?: number | string;
  sourceProductType?: string;
  sourceRawValue?: string;
  reviewSuggestion?: Record<string, any> | null;
  [key: string]: any;
}

export interface CandidatesResponse {
  termTypeCandidates: Candidate[];
  valueCandidates: Candidate[];
  suggestions?: unknown;
}

export type CandidateClusterRiskLevel = "low" | "medium" | "high" | string;

export interface CandidateClusterOccurrence {
  documentId?: string | number;
  document?: string;
  documentName?: string;
  fileName?: string | null;
  itemIndex?: string | number;
  item?: string | number;
  itemName?: string | null;
  rawFieldName?: string;
  rawValue?: string | null;
  context?: string;
  [key: string]: any;
}

export interface CandidateClusterSuggestion {
  recommendedAction?: ReviewAction | string;
  confidence?: number;
  riskLevel?: CandidateClusterRiskLevel;
  needsHumanReview?: boolean;
  needs_human_review?: boolean;
  humanReviewSummary?: string;
  human_review_summary?: string;
  reason?: string;
  batchOperationsPreview?: ReviewOperation[];
  batch_operations_preview?: ReviewOperation[];
  [key: string]: any;
}

export interface CandidateCluster {
  id?: string | number;
  clusterId?: string | number;
  clusterKey?: string;
  candidateType?: CandidateType;
  termType?: string;
  normalizedFieldName?: string;
  normalizedRawValue?: string;
  candidateIds?: Array<string | number>;
  documentCount?: number;
  occurrenceCount?: number;
  sourceProductType?: string;
  reason?: string;
  rawFieldNameSamples?: string[];
  rawValueSamples?: string[];
  commonContexts?: string[];
  sampleOccurrences?: CandidateClusterOccurrence[];
  reviewSuggestion?: CandidateClusterSuggestion | null;
  batchOperationsPreview?: ReviewOperation[];
  invalidSuggestionReason?: string;
  submitError?: string;
  [key: string]: any;
}

export interface CandidateClustersResponse {
  candidateClusters?: CandidateCluster[];
  clusters?: CandidateCluster[];
  items?: CandidateCluster[];
  data?: CandidateCluster[];
  summary?: {
    status?: string;
    candidateType?: "all" | CandidateType;
    documentId?: number | string | null;
    limit?: number | null;
    clusterCount?: number;
    termTypeClusterCount?: number;
    valueClusterCount?: number;
    returnedClusterCount?: number;
    [key: string]: unknown;
  };
  options?: {
    productTypes?: ProductTypeOption[];
    termTypes?: DictionaryTermType[];
    enumValues?: DictionaryValue[];
    runPolicy?: Record<string, unknown>;
    [key: string]: unknown;
  };
  productTypes?: ProductTypeOption[];
  termTypes?: DictionaryTermType[];
  enumValues?: DictionaryValue[];
  priorDecisions?: unknown[];
  runPolicy?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CandidateClusterReviewPromptResponse {
  prompt?: string;
  promptTemplate?: string;
  placeholders?: {
    productTypes?: string;
    termTypes?: string;
    enumValues?: string;
    candidateClusters?: string;
    priorDecisions?: string;
    [key: string]: string | undefined;
  };
  systemPrompt?: string;
  inputShape?: Record<string, unknown>;
  outputShape?: Record<string, unknown>;
  content?: string;
  [key: string]: unknown;
}

export interface CandidateClusterPromptData {
  productTypes: unknown[];
  termTypes: unknown[];
  enumValues: unknown[];
  priorDecisions: unknown[];
  runPolicy?: Record<string, unknown>;
}

export interface CandidateClusterFilters {
  status: CandidateStatus;
  candidateType?: "all" | CandidateType;
  documentId?: string | number;
  limit?: number;
}
