import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserPreferenceService } from "@/api/services/userPreference.service";

export type FilterPreferenceValue = Record<string, unknown>;

interface FilterPreferenceState {
  filtersByKey: Record<string, FilterPreferenceValue>;
  backendLoadedByKey: Record<string, boolean>;
  backendSyncErrorByKey: Record<string, string>;
  setFilters: <T extends object>(key: string, filters: Partial<T>) => void;
  replaceFilters: <T extends object>(key: string, filters: T) => void;
  hydrateFromBackend: <T extends object>(key: string, defaultFilters: T) => Promise<void>;
  syncToBackend: (key: string) => Promise<void>;
}

const filterPreferenceKey = (key: string) => `filter.${key}`;

const objectValue = (value: unknown): FilterPreferenceValue | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as FilterPreferenceValue;
};

const hasChangedFilterValue = (current: FilterPreferenceValue, patch: FilterPreferenceValue) =>
  Object.entries(patch).some(([key, value]) => current[key] !== value);

export const useFilterPreferenceStore = create<FilterPreferenceState>()(
  persist(
    (set, get) => ({
      filtersByKey: {},
      backendLoadedByKey: {},
      backendSyncErrorByKey: {},

      setFilters: (key, filters) => {
        set((state) => {
          const current = state.filtersByKey[key] ?? {};
          if (!hasChangedFilterValue(current, filters as FilterPreferenceValue)) return state;
          return {
            filtersByKey: {
              ...state.filtersByKey,
              [key]: {
                ...current,
                ...filters,
              } as FilterPreferenceValue,
            },
          };
        });
      },

      replaceFilters: (key, filters) => {
        set((state) => ({
          filtersByKey: {
            ...state.filtersByKey,
            [key]: filters as FilterPreferenceValue,
          },
        }));
      },

      hydrateFromBackend: async (key, defaultFilters) => {
        try {
          const remoteFilters = objectValue(
            await UserPreferenceService.getPreference<FilterPreferenceValue>(filterPreferenceKey(key)),
          );
          set((state) => ({
            filtersByKey: {
              ...state.filtersByKey,
              [key]: {
                ...(defaultFilters as FilterPreferenceValue),
                ...(remoteFilters ?? state.filtersByKey[key] ?? {}),
              },
            },
            backendLoadedByKey: {
              ...state.backendLoadedByKey,
              [key]: true,
            },
            backendSyncErrorByKey: {
              ...state.backendSyncErrorByKey,
              [key]: "",
            },
          }));
        } catch (error) {
          set((state) => ({
            filtersByKey: {
              ...state.filtersByKey,
              [key]: {
                ...(defaultFilters as FilterPreferenceValue),
                ...(state.filtersByKey[key] ?? {}),
              },
            },
            backendLoadedByKey: {
              ...state.backendLoadedByKey,
              [key]: true,
            },
            backendSyncErrorByKey: {
              ...state.backendSyncErrorByKey,
              [key]: error instanceof Error ? error.message : "load preference failed",
            },
          }));
        }
      },

      syncToBackend: async (key) => {
        const value = get().filtersByKey[key];
        if (!value) return;
        try {
          await UserPreferenceService.savePreference(filterPreferenceKey(key), value);
          set((state) => ({
            backendSyncErrorByKey: {
              ...state.backendSyncErrorByKey,
              [key]: "",
            },
          }));
        } catch (error) {
          set((state) => ({
            backendSyncErrorByKey: {
              ...state.backendSyncErrorByKey,
              [key]: error instanceof Error ? error.message : "save preference failed",
            },
          }));
        }
      },
    }),
    {
      name: "filter-preference-storage",
      partialize: (state) => ({ filtersByKey: state.filtersByKey }),
    },
  ),
);
