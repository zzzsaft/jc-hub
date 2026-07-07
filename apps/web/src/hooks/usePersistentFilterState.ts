import { useCallback, useEffect, useMemo } from "react";
import { useFilterPreferenceStore } from "@/store/useFilterPreferenceStore";

export function usePersistentFilterState<T extends object>(
  key: string,
  defaultFilters: T,
  options: { debounceMs?: number } = {},
) {
  const savedFilters = useFilterPreferenceStore((state) => state.filtersByKey[key]);
  const backendLoaded = useFilterPreferenceStore((state) => state.backendLoadedByKey[key] ?? false);
  const setStoreFilters = useFilterPreferenceStore((state) => state.setFilters);
  const hydrateFromBackend = useFilterPreferenceStore((state) => state.hydrateFromBackend);
  const syncToBackend = useFilterPreferenceStore((state) => state.syncToBackend);
  const debounceMs = options.debounceMs ?? 800;

  const filters = useMemo(
    () => ({ ...defaultFilters, ...(savedFilters ?? {}) }) as T,
    [defaultFilters, savedFilters],
  );

  useEffect(() => {
    void hydrateFromBackend(key, defaultFilters);
  }, [defaultFilters, hydrateFromBackend, key]);

  useEffect(() => {
    if (!backendLoaded) return;
    const timer = window.setTimeout(() => {
      void syncToBackend(key);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [backendLoaded, debounceMs, filters, key, syncToBackend]);

  const setFilters = useCallback((nextFilters: Partial<T>) => {
    setStoreFilters<T>(key, nextFilters);
  }, [key, setStoreFilters]);

  return {
    filters,
    setFilters,
  };
}
