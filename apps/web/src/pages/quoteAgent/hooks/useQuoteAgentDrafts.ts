import { useCallback, useState } from "react";
import type {
  ReviewDraft,
  ReviewOperation,
} from "../types";
import { draftKey } from "../utils";

export function useQuoteAgentDrafts(setMessage: (message: string) => void) {
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [selectedDraftKeys, setSelectedDraftKeys] = useState<string[]>([]);

  const saveDraft = (draft: ReviewDraft) => {
    const key = draftKey(draft.candidateType, draft.candidateId);
    setDrafts((current) => ({ ...current, [key]: draft }));
    setSelectedDraftKeys((current) => (current.includes(key) ? current : [...current, key]));
    setMessage("已保存为待提交草稿。");
  };

  const selectedOperations = () => selectedDraftKeys.map((key) => drafts[key]).filter(Boolean) as ReviewOperation[];

  const clearSelectedDrafts = () => {
    setDrafts((current) => {
      const next = { ...current };
      selectedDraftKeys.forEach((key) => delete next[key]);
      return next;
    });
    setSelectedDraftKeys([]);
  };

  const applyDeepSeekDrafts = useCallback((nextDrafts: ReviewDraft[]) => {
    setDrafts((current) => {
      const next = { ...current };
      nextDrafts.forEach((draft) => { next[draftKey(draft.candidateType, draft.candidateId)] = draft; });
      return next;
    });
    setSelectedDraftKeys((current) => Array.from(new Set([...current, ...nextDrafts.map((draft) => draftKey(draft.candidateType, draft.candidateId))])));
  }, []);

  return {
    applyDeepSeekDrafts,
    clearSelectedDrafts,
    drafts,
    saveDraft,
    selectedDraftKeys,
    selectedOperations,
    setSelectedDraftKeys,
  };
}
