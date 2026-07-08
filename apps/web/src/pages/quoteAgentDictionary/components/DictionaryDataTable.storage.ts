import type {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
} from "@tanstack/react-table";

export type PersistedTableState = {
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  columnSizing?: ColumnSizingState;
};

export function readPersistedState(storageKey: string): PersistedTableState {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

export function writePersistedState(storageKey: string, state: PersistedTableState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}
