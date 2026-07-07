import { useEffect, useMemo, useState } from "react";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { quoteAgentService } from "../../quoteAgent/services/quoteAgent.service";
import type { DictionaryTermType, DictionaryValue } from "../../quoteAgent/types";
import type {
  DictionaryEditorState,
  DictionaryValueFormValues,
  TermTypeFormValues,
} from "../types";
import {
  dictionaryValueForm,
  dictionaryValuePayload,
  errorText,
  filterAliasList,
  includesKeyword,
  termTypeForm,
  termTypePayload,
} from "../utils";
import { useDictionaryOptionsStore } from "../store/useDictionaryOptionsStore";

const defaultDictionaryFilters = {
  keyword: "",
};

export function useDictionaryManagerState() {
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.dictionaryManager",
    defaultDictionaryFilters,
  );
  const keyword = filters.keyword;
  const termTypes = useDictionaryOptionsStore((state) => state.termTypes);
  const values = useDictionaryOptionsStore((state) => state.values);
  const productTypes = useDictionaryOptionsStore((state) => state.productTypes);
  const optionsLoading = useDictionaryOptionsStore((state) => state.loading);
  const loadOptions = useDictionaryOptionsStore((state) => state.load);
  const upsertTermType = useDictionaryOptionsStore((state) => state.upsertTermType);
  const upsertValue = useDictionaryOptionsStore((state) => state.upsertValue);
  const removeValue = useDictionaryOptionsStore((state) => state.removeValue);
  const [editor, setEditor] = useState<DictionaryEditorState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = async (options?: { force?: boolean }) => {
    setError("");
    try {
      await loadOptions(options);
    } catch (error) {
      setError(errorText(error));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filteredTermTypes = useMemo(
    () =>
      termTypes.filter((item) =>
        includesKeyword(
          [
            item.termType,
            item.displayName,
            item.quoteDisplayName,
            item.category,
            item.valueKind,
            ...(item.aliasNames ?? item.aliases ?? []),
          ],
          keyword,
        ),
      ),
    [keyword, termTypes],
  );

  const openCreateTermType = () => setEditor({ kind: "termType", mode: "create", values: termTypeForm() });
  const openEditTermType = (record: DictionaryTermType) =>
    setEditor({ kind: "termType", mode: "edit", record, values: termTypeForm(record) });
  const openCreateValue = (termType?: string) =>
    setEditor({
      kind: "value",
      mode: "create",
      values: dictionaryValueForm(undefined, termType || termTypes[0]?.termType || ""),
    });
  const openEditValue = (record: DictionaryValue) =>
    setEditor({ kind: "value", mode: "edit", record, values: dictionaryValueForm(record) });

  const updateDictionaryTermTypeField = async (
    record: DictionaryTermType,
    patch: Partial<DictionaryTermType>,
  ) => {
    const id = record.id;
    if (id == null || id === "") throw new Error("缺少字典字段 id，无法保存");

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        termType: String(patch.termType ?? record.termType ?? "").trim(),
        displayName: String(patch.displayName ?? record.displayName ?? "").trim(),
        quoteDisplayName: String(patch.quoteDisplayName ?? record.quoteDisplayName ?? "").trim(),
        category: String(patch.category ?? record.category ?? "").trim(),
        valueKind: String(patch.valueKind ?? record.valueKind ?? "").trim(),
        applicableProductTypes: patch.applicableProductTypes ?? record.applicableProductTypes ?? [],
        aliasNames: patch.aliasNames ?? record.aliasNames ?? record.aliases ?? [],
        sortOrder: patch.sortOrder ?? record.sortOrder,
      };
      const saved = await quoteAgentService.updateTermType(id, payload);
      upsertTermType({ ...record, ...payload, ...saved });
      setMessage("保存成功");
    } catch (error) {
      setError(errorText(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateDictionaryValueField = async (
    record: DictionaryValue,
    patch: Partial<DictionaryValue>,
  ) => {
    const id = record.id;
    if (id == null || id === "") throw new Error("缺少字典标准值 id，无法保存");

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        termType: String(record.termType ?? ""),
        canonicalValue: String(patch.canonicalValue ?? record.canonicalValue ?? "").trim(),
        displayName: String(patch.displayName ?? record.displayName ?? "").trim(),
        aliasNames: filterAliasList(patch.aliasNames ?? record.aliasNames ?? record.aliases ?? [], [
          patch.canonicalValue ?? record.canonicalValue,
        ]),
      };
      const saved = await quoteAgentService.updateDictionaryValue(id, payload);
      upsertValue({ ...record, ...payload, ...saved });
      setMessage("保存成功");
    } catch (error) {
      setError(errorText(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const deleteDictionaryValue = async (record: DictionaryValue) => {
    const id = record.id;
    if (id == null || id === "") throw new Error("缺少字典标准值 id，无法删除");

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await quoteAgentService.deleteDictionaryValue(id);
      removeValue(id);
      setMessage("删除成功");
    } catch (error) {
      setError(errorText(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const updateEditorValues = (values: Partial<TermTypeFormValues> | Partial<DictionaryValueFormValues>) => {
    setEditor((current) => current ? { ...current, values: { ...current.values, ...values } as any } : current);
  };

  const submitEditor = async () => {
    if (!editor) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editor.kind === "termType") {
        const payload = termTypePayload(editor.values);
        if (!payload.termType) throw new Error("请填写 termType");
        if (editor.mode === "create") {
          const saved = await quoteAgentService.createTermType(payload);
          upsertTermType(saved);
        } else {
          const id = editor.record?.id;
          if (id == null || id === "") throw new Error("缺少字典字段 id，无法调用编辑接口。");
          const saved = await quoteAgentService.updateTermType(id, payload);
          upsertTermType({ ...editor.record, ...payload, ...saved });
        }
      } else {
        const payload = dictionaryValuePayload(editor.values);
        if (!payload.termType || !payload.canonicalValue) throw new Error("请填写 termType 和 canonicalValue");
        if (editor.mode === "create") {
          const saved = await quoteAgentService.createDictionaryValue(payload);
          upsertValue(saved);
        } else {
          const id = editor.record?.id;
          if (id == null || id === "") throw new Error("缺少字典标准值 id，无法调用编辑接口。");
          const saved = await quoteAgentService.updateDictionaryValue(id, payload);
          upsertValue({ ...editor.record, ...payload, ...saved });
        }
      }
      setEditor(null);
      setMessage("保存成功");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return {
    keyword,
    loading: optionsLoading,
    saving,
    error,
    message,
    termTypes,
    values,
    productTypes,
    filteredTermTypes,
    editor,
    setKeyword: (value: string) => setFilters({ keyword: value }),
    reload,
    openCreateTermType,
    openEditTermType,
    openCreateValue,
    openEditValue,
    updateDictionaryTermTypeField,
    updateDictionaryValueField,
    deleteDictionaryValue,
    closeEditor: () => setEditor(null),
    updateEditorValues,
    submitEditor,
  };
}
