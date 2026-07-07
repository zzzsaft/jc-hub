import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  CandidateStatus,
  UnitAlias,
  UnitCandidate,
  UnitCandidateReviewPromptResponse,
  UnitCandidateReviewSuggestion,
} from "../types";
import { errorText } from "../utils";
import {
  filterUnitCandidates,
  payloadFromUnitSuggestion,
  unitCandidateId,
  unitSuggestionsFromResponse,
} from "../unitCandidateReview.utils";

const defaultUnitCandidateFilters = {
  status: "pending" as CandidateStatus,
  keyword: "",
};

export function useUnitCandidateReviewState() {
  const requestIdRef = useRef(0);
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.unitCandidateReview",
    defaultUnitCandidateFilters,
  );
  const status = filters.status;
  const keyword = filters.keyword;
  const [aliases, setAliases] = useState<UnitAlias[]>([]);
  const [candidates, setCandidates] = useState<UnitCandidate[]>([]);
  const [suggestionsById, setSuggestionsById] = useState<Record<string, UnitCandidateReviewSuggestion>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [expandedCandidateIds, setExpandedCandidateIds] = useState<string[]>([]);
  const [reviewPrompt, setReviewPrompt] = useState<UnitCandidateReviewPromptResponse | string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const visibleCandidates = useMemo(
    () => filterUnitCandidates(candidates, keyword),
    [candidates, keyword],
  );

  const selectedCandidates = useMemo(
    () => visibleCandidates.filter((candidate) => selectedCandidateIds.includes(unitCandidateId(candidate))),
    [selectedCandidateIds, visibleCandidates],
  );

  const loadReviewPrompt = useCallback(async () => {
    try {
      setReviewPrompt(await quoteAgentService.getUnitCandidateReviewPrompt());
    } catch {
      setReviewPrompt("");
    }
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    setMessage("正在刷新单位候选...");
    try {
      const [nextCandidates, nextAliases] = await Promise.all([
        quoteAgentService.getUnitCandidates({ status }),
        quoteAgentService.getUnitAliases(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setCandidates(nextCandidates);
      setAliases(nextAliases);
      setSelectedCandidateIds([]);
      setExpandedCandidateIds([]);
      setMessage("单位候选已刷新。");
    } catch (err) {
      if (requestId === requestIdRef.current) setError(errorText(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [status]);

  const applyManualSuggestions = useCallback((response: unknown) => {
    const suggestions = unitSuggestionsFromResponse(response);
    const visibleIds = new Set(visibleCandidates.map(unitCandidateId));
    const nextSuggestions = suggestions.filter((suggestion) => visibleIds.has(String(suggestion.candidateId)));
    setSuggestionsById((current) => ({
      ...current,
      ...Object.fromEntries(nextSuggestions.map((suggestion) => [String(suggestion.candidateId), suggestion])),
    }));
    setSelectedCandidateIds([]);
    setMessage(
      nextSuggestions.length
        ? `DeepSeek 建议已应用到 ${nextSuggestions.length} 个单位候选，请人工勾选确认后提交。`
        : "未匹配到当前页面单位候选，请检查 JSON 中的 candidateId。",
    );
    return nextSuggestions.length;
  }, [visibleCandidates]);

  const toggleSelected = useCallback((candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  }, []);

  const toggleExpanded = useCallback((candidateId: string) => {
    setExpandedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  }, []);

  const saveManualSuggestion = useCallback((candidate: UnitCandidate, suggestion: UnitCandidateReviewSuggestion) => {
    const candidateId = unitCandidateId(candidate);
    setSuggestionsById((current) => ({
      ...current,
      [candidateId]: {
        ...suggestion,
        candidateId,
      },
    }));
    setSelectedCandidateIds((current) =>
      suggestion.recommendedAction === "approve" || suggestion.recommendedAction === "reject"
        ? Array.from(new Set([...current, candidateId]))
        : current.filter((id) => id !== candidateId),
    );
    setMessage("手动审核建议已保存，请勾选后批量提交，或直接提交本条。");
  }, []);

  const submitCandidateSuggestion = useCallback(async (
    candidate: UnitCandidate,
    suggestion: UnitCandidateReviewSuggestion,
  ) => {
    const candidateId = unitCandidateId(candidate);
    if (suggestion.recommendedAction !== "approve" && suggestion.recommendedAction !== "reject") {
      setError("当前手动建议不是 approve/reject，不能提交。");
      return;
    }

    const confirmed = window.confirm(`将提交单位候选 ${candidateId} 的审核结果。是否继续？`);
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (suggestion.recommendedAction === "approve") {
        await quoteAgentService.approveUnitCandidate(candidateId, payloadFromUnitSuggestion(candidate, suggestion));
      } else {
        await quoteAgentService.rejectUnitCandidate(candidateId, {
          reason: suggestion.reason,
          reviewedBy: "Codex",
        });
      }
      setSuggestionsById((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
      await load();
      setMessage(`单位候选 ${candidateId} 审核已提交。`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }, [load]);

  const submitCandidates = useCallback(async (targetCandidates: UnitCandidate[]) => {
    if (!targetCandidates.length) {
      setError("没有选择可提交的单位候选。");
      return;
    }

    const missingSuggestion = targetCandidates.find((candidate) => !suggestionsById[unitCandidateId(candidate)]);
    if (missingSuggestion) {
      setError(`单位候选 ${unitCandidateId(missingSuggestion)} 尚未生成建议。`);
      return;
    }

    const actionableCandidates = targetCandidates.filter((candidate) => {
      const action = suggestionsById[unitCandidateId(candidate)]?.recommendedAction;
      return action === "approve" || action === "reject";
    });
    if (!actionableCandidates.length) {
      setError("所选单位候选没有可提交的 approve/reject 建议。");
      return;
    }

    const confirmed = window.confirm(`将提交 ${actionableCandidates.length} 个单位候选审核结果。是否继续？`);
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    setMessage("");
    const failures: string[] = [];
    try {
      for (const candidate of actionableCandidates) {
        const candidateId = unitCandidateId(candidate);
        const suggestion = suggestionsById[candidateId];
        try {
          if (suggestion.recommendedAction === "approve") {
            await quoteAgentService.approveUnitCandidate(candidateId, payloadFromUnitSuggestion(candidate, suggestion));
          } else if (suggestion.recommendedAction === "reject") {
            await quoteAgentService.rejectUnitCandidate(candidateId, {
              reason: suggestion.reason,
              reviewedBy: "Codex",
            });
          }
        } catch (err) {
          failures.push(`${candidateId}: ${errorText(err)}`);
        }
      }

      await load();
      if (failures.length) {
        setError(`部分单位候选提交失败：${failures.join("；")}`);
      } else {
        setSuggestionsById({});
        setMessage(`单位候选审核已提交：${actionableCandidates.length} 条。`);
      }
    } finally {
      setSubmitting(false);
    }
  }, [load, suggestionsById]);

  const submitSelected = useCallback(
    () => submitCandidates(selectedCandidates),
    [selectedCandidates, submitCandidates],
  );

  useEffect(() => {
    void loadReviewPrompt();
  }, [loadReviewPrompt]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    aliases,
    candidates,
    error,
    expandedCandidateIds,
    keyword,
    loading,
    message,
    reviewPrompt,
    selectedCandidateIds,
    selectedCandidates,
    status,
    submitting,
    suggestionsById,
    visibleCandidates,
    applyManualSuggestions,
    load,
    saveManualSuggestion,
    setKeyword: (value: string) => setFilters({ keyword: value }),
    setStatus: (value: CandidateStatus) => setFilters({ status: value }),
    submitCandidateSuggestion,
    submitSelected,
    toggleExpanded,
    toggleSelected,
  };
}
