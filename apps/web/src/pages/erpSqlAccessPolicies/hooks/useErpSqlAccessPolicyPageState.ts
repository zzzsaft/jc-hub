import { useEffect, useMemo, useState } from "react";
import { message } from "@/components/ui/core";
import { emptyPolicyForm } from "../constants";
import { ErpSqlAccessPolicyService } from "../services/erpSqlAccessPolicy.service";
import type { AccessPolicyAuditLog, ErpSqlAccessPolicy, PolicyFormState } from "../types";
import { formToPayload, policyToForm, validateForm } from "../utils";

const pageSize = 20;

export function useErpSqlAccessPolicyPageState() {
  const [items, setItems] = useState<ErpSqlAccessPolicy[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<PolicyFormState>(emptyPolicyForm);
  const [preview, setPreview] = useState<unknown>(null);
  const [auditLogs, setAuditLogs] = useState<AccessPolicyAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedPolicy = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const result = await ErpSqlAccessPolicyService.list({
        page: nextPage,
        pageSize,
        keyword: keyword || undefined,
        enabled: enabledFilter || undefined,
      });
      const nextItems = Array.isArray(result.items) ? result.items : [];
      if (!Array.isArray(result.items)) throw new Error("策略接口响应无效");
      setItems(nextItems);
      setTotal(result.pageInfo?.total || 0);
      setPage(result.pageInfo?.page || nextPage);
      const nextSelected = nextItems.find((item) => item.id === selectedId) || nextItems[0] || null;
      selectPolicy(nextSelected);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "策略加载失败");
    } finally {
      setLoading(false);
    }
  };

  const selectPolicy = (policy: ErpSqlAccessPolicy | null) => {
    setSelectedId(policy?.id || "");
    setForm(policyToForm(policy));
    setPreview(null);
    if (policy?.id) loadAuditLogs(policy.id);
    else setAuditLogs([]);
  };

  const patchForm = <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const newPolicy = () => {
    setSelectedId("");
    setForm({ ...emptyPolicyForm });
    setPreview(null);
    setAuditLogs([]);
  };

  const save = async () => {
    const error = validateForm(form);
    if (error) {
      message.error(error);
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const policy = selectedId
        ? await ErpSqlAccessPolicyService.update(selectedId, payload)
        : await ErpSqlAccessPolicyService.create(payload);
      message.success("策略已保存");
      await load(page);
      selectPolicy(policy);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "策略保存失败");
    } finally {
      setSaving(false);
    }
  };

  const previewScope = async () => {
    const error = validateForm(form);
    if (error) {
      message.error(error);
      return;
    }
    setSaving(true);
    try {
      setPreview(await ErpSqlAccessPolicyService.previewScope(formToPayload(form)));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "预览失败");
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const policy = await ErpSqlAccessPolicyService.setEnabled(selectedId, enabled);
      message.success(enabled ? "策略已启用" : "策略已禁用");
      await load(page);
      selectPolicy(policy);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!selectedId || !window.confirm("归档后该策略会禁用并从列表隐藏，确认归档？")) return;
    setSaving(true);
    try {
      await ErpSqlAccessPolicyService.archive(selectedId);
      message.success("策略已归档");
      newPolicy();
      await load(1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "归档失败");
    } finally {
      setSaving(false);
    }
  };

  const loadAuditLogs = async (id = selectedId) => {
    if (!id) return;
    try {
      const result = await ErpSqlAccessPolicyService.auditLogs(id, { page: 1, pageSize: 20 });
      setAuditLogs(result.items);
    } catch {
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    items,
    total,
    page,
    pageSize,
    keyword,
    enabledFilter,
    selectedId,
    selectedPolicy,
    form,
    preview,
    auditLogs,
    loading,
    saving,
    setKeyword,
    setEnabledFilter,
    patchForm,
    load,
    selectPolicy,
    newPolicy,
    save,
    previewScope,
    setEnabled,
    archive,
  };
}
