import type { CandidateStatus } from "./status.types";

export interface UnitAlias {
  id?: string | number;
  canonicalUnit?: string;
  aliasValue?: string;
  displayUnit?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface UnitAliasesResponse {
  aliases?: UnitAlias[];
  unitAliases?: UnitAlias[];
  items?: UnitAlias[];
  data?: UnitAlias[] | { aliases?: UnitAlias[]; items?: UnitAlias[] };
  [key: string]: unknown;
}

export interface UnitCandidate {
  id: string | number;
  status?: CandidateStatus | string;
  rawValue?: string;
  rawUnit?: string;
  normalizedRawUnit?: string;
  proposedCanonicalUnit?: string;
  documentId?: string | number;
  termType?: string;
  parsedValue?: unknown;
  parsedResult?: unknown;
  parsed?: unknown;
  [key: string]: any;
}

export type UnitCandidateReviewAction = "approve" | "reject" | "needs_human_review";
export type UnitCandidateRiskLevel = "low" | "medium" | "high" | string;

export interface UnitCandidateReviewSuggestion {
  candidateId: string | number;
  recommendedAction: UnitCandidateReviewAction;
  canonicalUnit?: string | null;
  displayUnit?: string | null;
  aliasValue?: string | null;
  confidence?: number | null;
  riskLevel?: UnitCandidateRiskLevel;
  needsHumanReview?: boolean;
  needs_human_review?: boolean;
  reason?: string;
  [key: string]: any;
}

export interface UnitCandidateReviewPromptResponse {
  prompt?: string;
  promptTemplate?: string;
  placeholders?: {
    unitAliases?: string;
    unitCandidates?: string;
    [key: string]: string | undefined;
  };
  inputShape?: Record<string, unknown>;
  outputShape?: Record<string, unknown>;
  applyPolicy?: Record<string, unknown>;
  content?: string;
  systemPrompt?: string;
  [key: string]: unknown;
}

export interface UnitCandidatesResponse {
  candidates?: UnitCandidate[];
  unitCandidates?: UnitCandidate[];
  items?: UnitCandidate[];
  data?: UnitCandidate[] | { candidates?: UnitCandidate[]; items?: UnitCandidate[] };
  [key: string]: unknown;
}

export interface UnitAliasPayload {
  canonicalUnit: string;
  aliasValue: string;
  displayUnit: string;
  reviewedBy?: string;
}
