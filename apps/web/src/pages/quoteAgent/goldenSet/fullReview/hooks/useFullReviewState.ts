import { useCallback, useEffect, useRef, useState } from "react";
import { fullReviewService } from "../service";
import { createRevisionedAutosaveCoordinator } from "../revisionedAutosave";
import type { ConfigurationField, ErpMapping, FullReviewAnnotation, FullReviewTask, PackageAnnotation, SaveState } from "../types";
import { reconcilePackageAnnotation, validateForSubmit } from "../utils";

const emptyAnnotation = (): FullReviewAnnotation => ({
  admission: { decision: "quarantine", reason_codes: [], notes: null },
  package: { evidence_sufficiency: "abstain", items: [], notes: null },
  configuration_fields: [],
  erp: [],
});

export function useFullReviewState() {
  const [task, setTask] = useState<FullReviewTask | null>(null);
  const [annotation, setAnnotation] = useState<FullReviewAnnotation>(emptyAnnotation);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const skipDraft = useRef(true);
  const taskRef = useRef<FullReviewTask | null>(null);
  const loadGeneration = useRef(0);
  const coordinatorRef = useRef<ReturnType<typeof createRevisionedAutosaveCoordinator> | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createRevisionedAutosaveCoordinator({
      save: (_documentId, revision, nextAnnotation) => {
        const current = taskRef.current;
        if (!current) return Promise.reject(new Error("没有待保存任务"));
        return fullReviewService.draft({ ...current, revision }, nextAnnotation);
      },
      onRevision: (revision) => {
        if (taskRef.current) taskRef.current = { ...taskRef.current, revision };
        setTask((current) => current ? { ...current, revision } : current);
      },
      onState: setSaveState,
    });
  }

  const loadNext = useCallback(async () => {
    const requestGeneration = ++loadGeneration.current;
    setLoading(true);
    setErrors([]);
    try {
      const next = await fullReviewService.next();
      if (requestGeneration !== loadGeneration.current) return;
      taskRef.current = next;
      coordinatorRef.current?.activate(next.document_id, next.revision);
      setTask(next);
      setAnnotation(next.annotation ?? emptyAnnotation());
      setSaveState("idle");
      skipDraft.current = true;
    } catch {
      if (requestGeneration !== loadGeneration.current) return;
      setErrors(["加载审核任务失败"]);
    } finally {
      if (requestGeneration === loadGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNext(); }, [loadNext]);
  useEffect(() => {
    if (!taskRef.current) return;
    if (skipDraft.current) { skipDraft.current = false; return; }
    coordinatorRef.current?.queue(annotation);
  }, [annotation]);

  const updateAdmission = useCallback((admission: FullReviewAnnotation["admission"]) => setAnnotation((current) => ({ ...current, admission })), []);
  const updatePackage = useCallback((pkg: PackageAnnotation) => setAnnotation((current) => reconcilePackageAnnotation(current, pkg)), []);
  const updateConfigurationField = useCallback((index: number, field: ConfigurationField) => setAnnotation((current) => ({ ...current, configuration_fields: current.configuration_fields.map((item, itemIndex) => itemIndex === index ? field : item) })), []);
  const updateErp = useCallback((erp: ErpMapping[]) => setAnnotation((current) => ({ ...current, erp })), []);

  const submit = useCallback(async () => {
    if (!task) return false;
    const validation = validateForSubmit(annotation);
    setErrors(validation.errors);
    if (!validation.passed) return false;
    const submittedDocumentId = task.document_id;
    try {
      await coordinatorRef.current?.submit(annotation, (_documentId, revision, nextAnnotation) =>
        fullReviewService.submit({ ...task, revision }, nextAnnotation));
      if (taskRef.current?.document_id !== submittedDocumentId) return false;
      await loadNext();
      return true;
    } catch {
      if (taskRef.current?.document_id !== submittedDocumentId) return false;
      setSaveState("failed");
      setErrors(["提交失败，请保留当前编辑后重试"]);
      return false;
    }
  }, [annotation, loadNext, task]);

  return { task, annotation, loading, saveState, errors, submit, skip: loadNext, updateAdmission, updatePackage, updateConfigurationField, updateErp };
}
