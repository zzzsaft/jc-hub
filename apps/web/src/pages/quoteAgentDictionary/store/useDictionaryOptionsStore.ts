import { create } from "zustand";
import { quoteAgentService } from "../../quoteAgent/services/quoteAgent.service";
import type { DictionaryOptions, DictionaryTermType, DictionaryValue, ProductTypeOption } from "../../quoteAgent/types";
import {
  isDictionaryOptionsCacheFresh,
  readDictionaryOptionsCache,
  writeDictionaryOptionsCache,
} from "../dictionaryCache";
import { dedupeDictionaryValues, normalizeDictionaryText, valueKey } from "../utils";

type LoadOptions = {
  force?: boolean;
};

type DictionaryOptionsState = {
  termTypes: DictionaryTermType[];
  values: DictionaryValue[];
  productTypes: ProductTypeOption[];
  loading: boolean;
  error: string;
  loadedAt: number;
  load: (options?: LoadOptions) => Promise<DictionaryOptions>;
  setOptions: (options: DictionaryOptions) => void;
  mergeOptions: (options: Partial<DictionaryOptions>) => void;
  upsertTermType: (termType: DictionaryTermType) => void;
  upsertValue: (value: DictionaryValue) => void;
  removeValue: (id: string | number) => void;
};

const emptyOptions: DictionaryOptions = {
  termTypes: [],
  values: [],
  productTypes: [],
};

const initialCache = readDictionaryOptionsCache();
const initialOptions = initialCache?.options ?? emptyOptions;

const persistOptions = (options: DictionaryOptions) => {
  writeDictionaryOptionsCache({
    termTypes: options.termTypes,
    values: dedupeDictionaryValues(options.values),
    productTypes: options.productTypes,
  });
};

const byKey = <T,>(items: T[], keyOf: (item: T) => string) => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = keyOf(item);
    if (key) map.set(key, item);
  });
  return Array.from(map.values());
};

const termTypeMergeKey = (item: DictionaryTermType) =>
  normalizeDictionaryText(item.termType) || normalizeDictionaryText(item.displayName) || String(item.id ?? "");

const mergeTermTypes = (items: DictionaryTermType[]) => {
  const map = new Map<string, DictionaryTermType>();
  items.forEach((item) => {
    const key = termTypeMergeKey(item);
    if (!key) return;
    map.set(key, { ...(map.get(key) ?? {}), ...item });
  });
  return Array.from(map.values());
};

const normalizeOptions = (options: DictionaryOptions): DictionaryOptions => ({
  termTypes: mergeTermTypes(options.termTypes ?? []),
  values: dedupeDictionaryValues(options.values ?? []),
  productTypes: options.productTypes ?? [],
});

export const useDictionaryOptionsStore = create<DictionaryOptionsState>((set, get) => ({
  termTypes: initialOptions.termTypes ?? [],
  values: dedupeDictionaryValues(initialOptions.values ?? []),
  productTypes: initialOptions.productTypes ?? [],
  loading: false,
  error: "",
  loadedAt: initialCache?.savedAt ?? 0,

  load: async (options) => {
    const cached = readDictionaryOptionsCache();
    if (!options?.force && isDictionaryOptionsCacheFresh(cached)) {
      const nextOptions = normalizeOptions(cached?.options ?? emptyOptions);
      set({ ...nextOptions, loadedAt: cached?.savedAt ?? Date.now(), error: "" });
      return nextOptions;
    }

    set({ loading: true, error: "" });
    try {
      const nextOptions = normalizeOptions(await quoteAgentService.getDictionaryOptions());
      persistOptions(nextOptions);
      set({ ...nextOptions, loading: false, loadedAt: Date.now(), error: "" });
      return nextOptions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ loading: false, error: message });
      throw error;
    }
  },

  setOptions: (options) => {
    const nextOptions = normalizeOptions(options);
    persistOptions(nextOptions);
    set({ ...nextOptions, loadedAt: Date.now(), error: "" });
  },

  mergeOptions: (options) => {
    const current = get();
    const nextOptions = normalizeOptions({
      termTypes: mergeTermTypes([...(current.termTypes ?? []), ...(options.termTypes ?? [])]),
      values: [...(current.values ?? []), ...(options.values ?? [])],
      productTypes: byKey(
        [...(current.productTypes ?? []), ...(options.productTypes ?? [])],
        (item) => String(item.canonicalValue ?? item.value ?? item.displayName ?? item.label ?? ""),
      ),
    });
    persistOptions(nextOptions);
    set({ ...nextOptions, loadedAt: Date.now(), error: "" });
  },

  upsertTermType: (termType) => {
    const current = get();
    const nextOptions = normalizeOptions({
      termTypes: mergeTermTypes([...current.termTypes, termType]),
      values: current.values,
      productTypes: current.productTypes,
    });
    persistOptions(nextOptions);
    set({ ...nextOptions, loadedAt: Date.now(), error: "" });
  },

  upsertValue: (value) => {
    const current = get();
    const key = valueKey(value);
    const exists = current.values.some((item) => valueKey(item) === key);
    const nextOptions = normalizeOptions({
      termTypes: current.termTypes,
      values: current.values.map((item) => (valueKey(item) === key ? { ...item, ...value } : item)).concat(exists ? [] : [value]),
      productTypes: current.productTypes,
    });
    persistOptions(nextOptions);
    set({ ...nextOptions, loadedAt: Date.now(), error: "" });
  },

  removeValue: (id) => {
    const current = get();
    const nextOptions = normalizeOptions({
      termTypes: current.termTypes,
      values: current.values.filter((item) => String(item.id) !== String(id)),
      productTypes: current.productTypes,
    });
    persistOptions(nextOptions);
    set({ ...nextOptions, loadedAt: Date.now(), error: "" });
  },
}));
