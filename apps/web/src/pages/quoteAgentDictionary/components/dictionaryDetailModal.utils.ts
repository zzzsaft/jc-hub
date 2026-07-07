import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "../../quoteAgent/types";
import { filterAliasList } from "../utils";

export type ValueField = "canonicalValue" | "displayName" | "aliasNames";
export type ValueColumnWidthMap = Record<ValueField, number>;
export type TermField =
  | "termType"
  | "displayName"
  | "category"
  | "valueKind"
  | "aliasNames"
  | "applicableProductTypes";

export type EditingValueCell = {
  rowKey: string;
  field: ValueField;
  draft: string;
};

export type EditingTermField = {
  field: TermField;
  draft: string;
};

const VALUE_TABLE_WIDTHS_STORAGE_KEY = "quote-agent-dictionary-detail-values-column-widths";

export const DEFAULT_VALUE_COLUMN_WIDTHS: ValueColumnWidthMap = {
  canonicalValue: 320,
  displayName: 280,
  aliasNames: 260,
};

export const rowKeyOf = (value: DictionaryValue) =>
  String(value.id ?? `${value.termType ?? ""}:${value.canonicalValue ?? ""}`);

export const valueAliases = (value: DictionaryValue) =>
  filterAliasList(value.aliasNames ?? value.aliases ?? [], [value.canonicalValue]);

export const termAliases = (value?: DictionaryTermType) => filterAliasList(value?.aliasNames ?? value?.aliases ?? []);

export const joinTextList = (values: string[]) => values.join("\n");

export const productValue = (item: ProductTypeOption) =>
  String(item.canonicalValue ?? item.value ?? item.displayName ?? item.label ?? "").trim();

export const productLabel = (item: ProductTypeOption) =>
  String(item.displayName ?? item.label ?? item.canonicalValue ?? item.value ?? "").trim();

export function readValueColumnWidths(): ValueColumnWidthMap {
  if (typeof window === "undefined") return DEFAULT_VALUE_COLUMN_WIDTHS;
  try {
    const saved = window.localStorage.getItem(VALUE_TABLE_WIDTHS_STORAGE_KEY);
    if (!saved) return DEFAULT_VALUE_COLUMN_WIDTHS;
    const parsed = JSON.parse(saved) as Partial<ValueColumnWidthMap>;
    return {
      canonicalValue: Number(parsed.canonicalValue) || DEFAULT_VALUE_COLUMN_WIDTHS.canonicalValue,
      displayName: Number(parsed.displayName) || DEFAULT_VALUE_COLUMN_WIDTHS.displayName,
      aliasNames: Number(parsed.aliasNames) || DEFAULT_VALUE_COLUMN_WIDTHS.aliasNames,
    };
  } catch {
    return DEFAULT_VALUE_COLUMN_WIDTHS;
  }
}

export function writeValueColumnWidths(widths: ValueColumnWidthMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VALUE_TABLE_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}
