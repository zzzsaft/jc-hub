import type {
  Candidate,
  CandidateStatus,
  CandidateType,
  DocumentStatus,
  QuoteAgentItem,
  ReviewDraft,
} from "../types";
import {
  asArray,
  candidateTypeOf,
  matchCandidate,
} from "../utils";

export type StateUpdate<T> = T | ((current: T) => T);

export const defaultQuoteAgentFilters = {
  documentStatus: "dictionary_dirty" as DocumentStatus | "",
  candidateStatus: "pending" as CandidateStatus,
  search: "",
  page: 1,
  globalCandidates: false,
  hideNonReviewFields: true,
  hideTasksWithoutCandidates: true,
};

export const nextValue = <T>(value: StateUpdate<T>, current: T) =>
  typeof value === "function" ? (value as (current: T) => T)(current) : value;

export function buildReviewTargets(items: QuoteAgentItem[], allCandidates: Candidate[], currentDocumentId: string | number) {
  return items.flatMap((item) =>
    asArray(item.fields).map((field) => {
      const candidate = matchCandidate(field, item, allCandidates, currentDocumentId);
      const type = candidateTypeOf(field, candidate);
      return { item, field, candidate, candidateType: type, fieldKey: `${item.item_index ?? "x"}:${field.field_name ?? ""}:${field.raw_value ?? ""}:${candidate?.id ?? ""}` };
    }),
  );
}

export function buildPromptCandidates(reviewTargets: ReturnType<typeof buildReviewTargets>) {
  return reviewTargets
    .filter((target) => target.candidate && target.candidateType)
    .map((target) => ({
      candidate: target.candidate as Candidate,
      candidateType: target.candidateType as CandidateType,
      fieldName: String(target.field.field_name || target.candidate?.rawFieldName || ""),
      rawValue: String(target.field.raw_value || target.candidate?.rawValue || ""),
    }));
}

export function draftKeys(drafts: ReviewDraft[]) {
  return drafts.map((draft) => `${draft.candidateType}:${draft.candidateId}`);
}
