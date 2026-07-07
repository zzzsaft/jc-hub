import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { emptyOptions } from "../../constants";
import { quoteAgentService } from "../../services/quoteAgent.service";
import type {
  ArchiveChange,
  ArchiveItem,
  ContractArchiveDetail,
  ContractArchiveVersion,
  DictionaryOptions,
  ProductBinding,
} from "../../types";
import { bindingToPayload, errorText, setByDotPath } from "../../utils";

export function useArchiveDetailState(archiveIdOverride?: string | number) {
  const { archiveId: routeArchiveId = "" } = useParams<{ archiveId?: string }>();
  const archiveId = String(archiveIdOverride ?? routeArchiveId ?? "");
  const operatorName = useAuthStore((state) => state.name) || "Codex";
  const [archive, setArchive] = useState<ContractArchiveDetail | null>(null);
  const [latestVersion, setLatestVersion] = useState<ContractArchiveVersion | null>(null);
  const [dictionaryOptions, setDictionaryOptions] = useState<DictionaryOptions>(emptyOptions);
  const [versions, setVersions] = useState<ContractArchiveVersion[]>([]);
  const [historySnapshot, setHistorySnapshot] = useState<ContractArchiveDetail | null>(null);
  const [historyVersion, setHistoryVersion] = useState<ContractArchiveVersion | null>(null);
  const [changes, setChanges] = useState<Record<string, ArchiveChange>>({});
  const [dirtyFieldKeys, setDirtyFieldKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bindingSavingItemId, setBindingSavingItemId] = useState<string | number>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadVersions = useCallback(async () => {
    if (!archiveId) return;
    const response = await quoteAgentService.listContractArchiveVersions(archiveId);
    setVersions(response.versions ?? []);
  }, [archiveId]);

  const load = useCallback(async () => {
    if (!archiveId) return;
    setLoading(true);
    setError("");
    try {
      const response = await quoteAgentService.getContractArchive(archiveId);
      setArchive(response.archive);
      setLatestVersion(response.latestVersion ?? response.version ?? null);
      setHistorySnapshot(null);
      setHistoryVersion(null);
      setChanges({});
      setDirtyFieldKeys([]);
      await loadVersions();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [archiveId, loadVersions]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    quoteAgentService.getDictionaryOptions().then(setDictionaryOptions).catch(() => setDictionaryOptions(emptyOptions));
  }, []);

  const updateField = (path: string, value: unknown, meta?: { fieldIndex?: number }) => {
    setArchive((current) => current ? setByDotPath(current, path, value) : current);
    setChanges((current) => ({
      ...current,
      [path]: { path, value },
    }));
    if (meta?.fieldIndex !== undefined) {
      const dirtyKey = `${path}:${meta.fieldIndex}`;
      setDirtyFieldKeys((current) => current.includes(dirtyKey) ? current : [...current, dirtyKey]);
    }
  };

  const saveChanges = async () => {
    if (!archiveId || saving) return;
    const payloadChanges = Object.values(changes);
    if (!payloadChanges.length) {
      setMessage("没有未保存修改");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await quoteAgentService.updateContractArchive(archiveId, {
        editedBy: operatorName,
        changes: payloadChanges,
      });
      setArchive(response.archive);
      setLatestVersion(response.latestVersion ?? response.version ?? null);
      setChanges({});
      setDirtyFieldKeys([]);
      await loadVersions();
      setMessage("保存成功");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const saveBindings = async (item: ArchiveItem, bindings: ProductBinding[]) => {
    if (!archiveId || !item.id || bindingSavingItemId) return;
    const validBindings = bindings.filter((binding) => String(binding.productNumber ?? "").trim());
    setBindingSavingItemId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await quoteAgentService.updateItemProductBindings(archiveId, item.id, {
        editedBy: operatorName,
        bindings: validBindings.map(bindingToPayload),
      });
      setArchive(response.archive);
      setLatestVersion(response.latestVersion ?? response.version ?? null);
      await loadVersions();
      setMessage("产品编号绑定已保存");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBindingSavingItemId("");
    }
  };

  const openVersion = async (version: ContractArchiveVersion) => {
    if (!archiveId) return;
    setError("");
    try {
      const response = await quoteAgentService.getContractArchiveVersion(archiveId, version.version);
      setHistoryVersion(response.version);
      setHistorySnapshot(response.version.snapshot);
    } catch (error) {
      setError(errorText(error));
    }
  };

  const closeHistory = () => {
    setHistoryVersion(null);
    setHistorySnapshot(null);
  };

  const unsavedCount = useMemo(() => {
    const changePaths = Object.keys(changes);
    const fieldArrayChangeCount = changePaths.filter((path) => /^items\.\d+\.fields$/.test(path)).length;
    const nonFieldChangeCount = changePaths.length - fieldArrayChangeCount;
    return nonFieldChangeCount + (dirtyFieldKeys.length || fieldArrayChangeCount);
  }, [changes, dirtyFieldKeys.length]);

  return {
    archive,
    archiveId,
    bindingSavingItemId,
    changes,
    closeHistory,
    dictionaryOptions,
    dirtyFieldKeys,
    error,
    historySnapshot,
    historyVersion,
    latestVersion,
    load,
    loading,
    message,
    openVersion,
    saveBindings,
    saveChanges,
    saving,
    unsavedCount,
    updateField,
    versions,
  };
}
