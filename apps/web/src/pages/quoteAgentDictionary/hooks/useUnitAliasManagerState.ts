import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistentFilterState } from "@/hooks/usePersistentFilterState";
import { quoteAgentService } from "../../quoteAgent/services/quoteAgent.service";
import type { UnitAlias, UnitAliasPayload } from "../../quoteAgent/types";
import {
  isUnitAliasesCacheFresh,
  readUnitAliasesCache,
  writeUnitAliasesCache,
} from "../dictionaryCache";
import { errorText } from "../utils";

const text = (value: unknown) => String(value ?? "").trim();

const groupAliases = (aliases: UnitAlias[]) =>
  aliases.reduce<Record<string, UnitAlias[]>>((groups, alias) => {
    const key = text(alias.canonicalUnit) || "未设置标准单位";
    groups[key] = [...(groups[key] ?? []), alias];
    return groups;
  }, {});

const filterAliases = (aliases: UnitAlias[], keyword: string) => {
  const query = keyword.trim().toLowerCase();
  if (!query) return aliases;
  return aliases.filter((alias) =>
    [alias.canonicalUnit, alias.displayUnit, alias.aliasValue, alias.normalizedAlias]
      .map((value) => text(value).toLowerCase())
      .some((value) => value.includes(query)),
  );
};

const defaultUnitAliasFilters = {
  keyword: "",
};

export function useUnitAliasManagerState() {
  const [initialCache] = useState(() => readUnitAliasesCache());
  const [aliases, setAliases] = useState<UnitAlias[]>(initialCache?.aliases ?? []);
  const { filters, setFilters } = usePersistentFilterState(
    "quoteAgent.unitAliasManager",
    defaultUnitAliasFilters,
  );
  const keyword = filters.keyword;
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | number | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (options?: { force?: boolean }) => {
    const cached = readUnitAliasesCache();
    if (!options?.force && isUnitAliasesCacheFresh(cached)) {
      setAliases(cached?.aliases ?? []);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const nextAliases = await quoteAgentService.getUnitAliases();
      setAliases(nextAliases);
      writeUnitAliasesCache(nextAliases);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAliases = useMemo(() => filterAliases(aliases, keyword), [aliases, keyword]);
  const aliasGroups = useMemo(() => groupAliases(filteredAliases), [filteredAliases]);

  const saveAlias = useCallback(async (payload: UnitAliasPayload, aliasId?: string | number) => {
    const currentId = aliasId ?? "new";
    setSavingId(currentId);
    setError("");
    setMessage("");
    try {
      if (aliasId) {
        await quoteAgentService.updateUnitAlias(aliasId, payload);
        setMessage("单位 Alias 已更新");
      } else {
        await quoteAgentService.createUnitAlias(payload);
        setMessage("单位 Alias 已新增");
      }
      await load({ force: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingId(null);
    }
  }, [load]);

  return {
    aliases,
    aliasGroups,
    error,
    keyword,
    loading,
    message,
    savingId,
    load,
    saveAlias,
    setKeyword: (value: string) => setFilters({ keyword: value }),
  };
}
