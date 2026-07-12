import { useCallback, useEffect, useRef, useState } from "react";
import { fullReviewService } from "../service";
import type { ConfigurationField, ErpMapping, FullReviewAnnotation, FullReviewTask, PackageAnnotation, SaveState } from "../types";
import { validateForSubmit } from "../utils";

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
  const draftTimer = useRef<number | null>(null);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    try {
      const next = await fullReviewService.next();
      taskRef.current = next;
      setTask(next);
      setAnnotation(next.annotation ?? emptyAnnotation());
      setSaveState("idle");
      skipDraft.current = true;
    } catch {
      setErrors(["加载审核任务失败"]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNext(); }, [loadNext]);
  useEffect(() => {
    const currentTask = taskRef.current;
    if (!currentTask) return;
    if (skipDraft.current) { skipDraft.current = false; return; }
    draftTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fullReviewService.draft(currentTask, annotation);
        taskRef.current = taskRef.current?.document_id === currentTask.document_id ? { ...taskRef.current, revision: response.revision } : taskRef.current;
        setTask((current) => current?.document_id === currentTask.document_id ? { ...current, revision: response.revision } : current);
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    }, 1200);
    return () => {
      if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    };
  }, [annotation]);

  const updateAdmission = useCallback((admission: FullReviewAnnotation["admission"]) => setAnnotation((current) => ({ ...current, admission })), []);
  const updatePackage = useCallback((pkg: PackageAnnotation) => setAnnotation((current) => ({ ...current, package: pkg })), []);
  const updateConfigurationField = useCallback((index: number, field: ConfigurationField) => setAnnotation((current) => ({ ...current, configuration_fields: current.configuration_fields.map((item, itemIndex) => itemIndex === index ? field : item) })), []);
  const updateErp = useCallback((erp: ErpMapping[]) => setAnnotation((current) => ({ ...current, erp })), []);

  const submit = useCallback(async () => {
    if (!task) return false;
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    const validation = validateForSubmit(annotation);
    setErrors(validation.errors);
    if (!validation.passed) return false;
    setSaveState("saving");
    try {
      const response = await fullReviewService.submit(task, annotation);
      taskRef.current = taskRef.current?.document_id === task.document_id ? { ...taskRef.current, revision: response.revision } : taskRef.current;
      setTask((current) => current?.document_id === task.document_id ? { ...current, revision: response.revision } : current);
      setSaveState("saved");
      await loadNext();
      return true;
    } catch {
      setSaveState("failed");
      setErrors(["提交失败，请保留当前编辑后重试"]);
      return false;
    }
  }, [annotation, loadNext, task]);

  return { task, annotation, loading, saveState, errors, submit, skip: loadNext, updateAdmission, updatePackage, updateConfigurationField, updateErp };
}
