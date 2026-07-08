import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { crText } from "../locales";
import {
  healthReportKey,
  healthTargetId,
  healthTargetKind,
  primaryTarget,
  proposalId,
} from "../proposalReview";
import { conceptResolverService } from "../services/conceptResolver.service";
import {
  filterResolutions,
  sortResolutions,
} from "./resolutionFilters";
import type {
  ConceptActionIntent,
  ConceptResolution,
  ConceptResolverFilters,
  ConceptResolverRun,
  TargetHealthReport,
} from "../types";
import {
  asArray,
  errorText,
  filtersFromSearch,
  textValue,
  writeFiltersToSearch,
} from "../utils";

export function useConceptResolverReviewState() {
  const requestIdRef = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(searchParams), [searchParams]);
  const [resolutions, setResolutions] = useState<ConceptResolution[]>([]);
  const [healthReports, setHealthReports] = useState<Record<string, TargetHealthReport>>({});
  const [run, setRun] = useState<ConceptResolverRun | null>(null);
  const [selectedResolutionIds, setSelectedResolutionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const setFilters = useCallback((patch: Partial<ConceptResolverFilters>, resetPage = true) => {
    const next = {
      ...filters,
      ...patch,
      page: resetPage ? 1 : (patch.page ?? filters.page),
    };
    setSearchParams(writeFiltersToSearch(next), { replace: true });
  }, [filters, setSearchParams]);

  const loadRun = useCallback(async (runId: string) => {
    if (!runId) {
      setRun(null);
      return;
    }
    try {
      const response = await conceptResolverService.getRun(runId);
      setRun(response.run);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  const loadHealthReports = useCallback(async (items: ConceptResolution[]) => {
    const groups = new Map<string, Set<string>>();
    items.forEach((resolution) => {
      const target = primaryTarget(resolution);
      const kind = healthTargetKind(target);
      const id = healthTargetId(target);
      if (!kind || !id) return;
      if (!groups.has(kind)) groups.set(kind, new Set());
      groups.get(kind)?.add(id);
    });
    if (!groups.size) {
      setHealthReports({});
      return;
    }

    setHealthLoading(true);
    try {
      const next: Record<string, TargetHealthReport> = {};
      for (const [targetKind, ids] of groups.entries()) {
        const targetIds = Array.from(ids);
        let reports: TargetHealthReport[] = [];
        try {
          const response = await conceptResolverService.listHealthReports({
            targetKind,
            targetIds,
            limit: Math.max(100, targetIds.length),
            offset: 0,
          });
          reports = response.reports ?? [];
        } catch {
          const response = await conceptResolverService.listHealthReports({
            targetKind,
            limit: 1000,
            offset: 0,
          });
          reports = (response.reports ?? []).filter((report) => targetIds.includes(textValue(report.targetId, "")));
        }
        reports.forEach((report) => {
          const key = healthReportKey(report.targetKind ?? targetKind, report.targetId);
          if (key !== ":") next[key] = report;
        });
      }
      setHealthReports(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await conceptResolverService.listResolutions({
        route: filters.route || undefined,
        relationType: filters.relationType || undefined,
        candidateType: filters.candidateType === "all" ? undefined : filters.candidateType,
        limit: filters.limit,
      });
      if (requestId !== requestIdRef.current) return;
      const seen = new Set<string>();
      const nextResolutions = asArray(response.resolutions).filter((resolution) => {
        const id = proposalId(resolution);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setResolutions(nextResolutions);
      setSelectedResolutionIds((current) => current.filter((id) => seen.has(id)));
      setMessage(crText.messages.refreshed);
      void loadHealthReports(nextResolutions);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(errorText(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filters.candidateType, filters.limit, filters.relationType, filters.route, loadHealthReports]);

  const filteredResolutions = useMemo(
    () => sortResolutions(filterResolutions(resolutions, filters), filters),
    [filters, resolutions],
  );

  const pageCount = Math.max(1, Math.ceil(filteredResolutions.length / filters.pageSize));
  const currentPage = Math.min(filters.page, pageCount);
  const pagedResolutions = useMemo(() => {
    const start = (currentPage - 1) * filters.pageSize;
    return filteredResolutions.slice(start, start + filters.pageSize);
  }, [currentPage, filteredResolutions, filters.pageSize]);

  const selectedResolutions = useMemo(
    () => filteredResolutions.filter((resolution) => selectedResolutionIds.includes(proposalId(resolution))),
    [filteredResolutions, selectedResolutionIds],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedResolutionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }, []);

  const togglePageSelected = useCallback(() => {
    const pageIds = pagedResolutions.map(proposalId);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedResolutionIds.includes(id));
    setSelectedResolutionIds((current) =>
      allSelected ? current.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...current, ...pageIds])),
    );
  }, [pagedResolutions, selectedResolutionIds]);

  const clearFilters = useCallback(() => {
    setSearchParams(writeFiltersToSearch({
      runId: "",
      status: "pending",
      route: "",
      relationType: "",
      recommendedAction: "",
      candidateType: "all",
      riskLevel: "all",
      search: "",
      limit: 500,
      page: 1,
      pageSize: 30,
      sortKey: "candidateCount",
      sortDir: "desc",
    }), { replace: true });
  }, [setSearchParams]);

  const submitIntent = useCallback(async (intent: ConceptActionIntent) => {
    if (!intent.operations.length) {
      setError("没有后端可执行操作预览。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await conceptResolverService.submitBatchReviews(intent.operations as any, {
        deferCandidateRecheck: true,
      });
      await loadData();
      setSelectedResolutionIds([]);
      const failed = Number((result as any).failedCount ?? 0);
      const success = Number((result as any).successCount ?? intent.operations.length);
      if (failed > 0) {
        setError(`提交完成：成功 ${success}，失败 ${failed}。`);
      } else {
        setMessage(`提交完成：${intent.label}，操作 ${success} 条。`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }, [loadData]);

  const runDryResolver = useCallback(async () => {
    setRunning(true);
    setError("");
    try {
      const response = await conceptResolverService.runDryResolver({
        candidateType: filters.candidateType,
        status: "pending",
        limit: filters.limit,
        apply: false,
      });
      const nextRun = response.run;
      setRun(nextRun);
      setFilters({ runId: String(nextRun.id ?? "") }, false);
      setMessage(crText.messages.dryRunStarted(nextRun.id ?? "-"));
      await loadData();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunning(false);
    }
  }, [filters.candidateType, filters.limit, loadData, setFilters]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void loadRun(filters.runId); }, [filters.runId, loadRun]);

  useEffect(() => {
    if (currentPage === filters.page) return;
    setFilters({ page: currentPage }, false);
  }, [currentPage, filters.page, setFilters]);

  return {
    currentPage,
    error,
    filteredResolutions,
    filters,
    healthLoading,
    healthReports,
    loading,
    message,
    pageCount,
    pagedResolutions,
    run,
    running,
    selectedResolutionIds,
    selectedResolutions,
    submitting,
    clearFilters,
    loadData,
    runDryResolver,
    setFilters,
    submitIntent,
    togglePageSelected,
    toggleSelected,
  };
}
