import type { DictionaryTermType, DictionaryValue } from "../quoteAgent/types";
import { asArray } from "../quoteAgent/utils";
import type { DictionaryValueFormValues, TermTypeFormValues } from "./types";

export { asArray, errorText } from "../quoteAgent/utils";

export const normalizeDictionaryText = (value: unknown) =>
  String(value ?? "").normalize("NFKC").trim().toLowerCase();

export const aliasText = (alias: unknown) => {
  if (typeof alias === "string" || typeof alias === "number") return String(alias).trim();
  const value = alias as Record<string, unknown> | null | undefined;
  return String(
    value?.aliasValue ??
      value?.aliasName ??
      value?.value ??
      value?.name ??
      "",
  ).trim();
};

export const filterAliasList = (aliases: unknown, ignoredValues: unknown[] = []) => {
  const ignored = new Set(ignoredValues.map(normalizeDictionaryText).filter(Boolean));
  const seen = new Set<string>();
  const source = Array.isArray(aliases) ? aliases : [];

  return source
    .map(aliasText)
    .filter((item) => {
      const normalized = normalizeDictionaryText(item);
      if (!normalized || ignored.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
};

export const listText = (value: unknown, ignoredValues: unknown[] = []) =>
  filterAliasList(value, ignoredValues).join("\n");

export const textList = (value: string, ignoredValues: unknown[] = []) =>
  filterAliasList(
    value
      .split(/[\n,，、]/)
      .map((item) => item.trim()),
    ignoredValues,
  );

export const termTypeKey = (record: DictionaryTermType) => String(record.id ?? record.termType ?? "");

export const valueKey = (record: DictionaryValue) =>
  String(record.id ?? [record.termType, record.canonicalValue].filter(Boolean).join(":"));

export function dedupeDictionaryValues(values: DictionaryValue[]) {
  const businessKeysWithId = new Set(
    values
      .filter((value) => String(value.id ?? "").trim())
      .map((value) => {
        const termType = normalizeDictionaryText(value.termType);
        const canonicalValue = normalizeDictionaryText(value.canonicalValue);
        return canonicalValue ? `${termType}:${canonicalValue}` : "";
      })
      .filter(Boolean),
  );
  const seen = new Set<string>();

  return values.filter((value) => {
    const termType = normalizeDictionaryText(value.termType);
    const canonicalValue = normalizeDictionaryText(value.canonicalValue);
    const id = String(value.id ?? "").trim();
    const businessKey = canonicalValue
      ? `${termType}:${canonicalValue}`
      : `${termType}:${normalizeDictionaryText(value.displayName)}`;
    if (!id && businessKeysWithId.has(businessKey)) return false;
    const key = id || (canonicalValue
      ? businessKey
      : businessKey);

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const termTypeLabel = (record: DictionaryTermType) =>
  [record.displayName, record.termType].filter(Boolean).join(" / ") || "-";

export const valueLabel = (record: DictionaryValue) =>
  [record.displayName, record.canonicalValue].filter(Boolean).join(" / ") || "-";

export function termTypeForm(record?: DictionaryTermType): TermTypeFormValues {
  return {
    id: record?.id,
    termType: String(record?.termType ?? ""),
    displayName: String(record?.displayName ?? ""),
    quoteDisplayName: String(record?.quoteDisplayName ?? ""),
    category: String(record?.category ?? ""),
    valueKind: String(record?.valueKind ?? ""),
    applicableProductTypes: asArray(record?.applicableProductTypes).join("\n"),
    aliases: listText(record?.aliasNames ?? record?.aliases),
    sortOrder: record?.sortOrder == null ? "" : String(record.sortOrder),
  };
}

export function dictionaryValueForm(record?: DictionaryValue, defaultTermType = ""): DictionaryValueFormValues {
  return {
    id: record?.id,
    termType: String(record?.termType ?? defaultTermType),
    canonicalValue: String(record?.canonicalValue ?? ""),
    displayName: String(record?.displayName ?? ""),
    aliases: listText(record?.aliasNames ?? record?.aliases, [record?.canonicalValue]),
  };
}

export function termTypePayload(values: TermTypeFormValues) {
  return {
    termType: values.termType.trim(),
    displayName: values.displayName.trim(),
    quoteDisplayName: values.quoteDisplayName.trim(),
    category: values.category.trim(),
    valueKind: values.valueKind.trim(),
    applicableProductTypes: textList(values.applicableProductTypes),
    aliasNames: textList(values.aliases),
    sortOrder: values.sortOrder.trim() ? Number(values.sortOrder) : undefined,
  };
}

export function dictionaryValuePayload(values: DictionaryValueFormValues) {
  return {
    termType: values.termType.trim(),
    canonicalValue: values.canonicalValue.trim(),
    displayName: values.displayName.trim(),
    aliasNames: textList(values.aliases, [values.canonicalValue]),
  };
}

export function includesKeyword(parts: unknown[], keyword: string) {
  const text = keyword.trim().toLowerCase();
  if (!text) return true;
  return parts.filter(Boolean).join(" ").toLowerCase().includes(text);
}
