import type {
  CandidateCluster,
  CandidateClusterPromptData,
  DictionaryOptions,
} from "./types";
import { asArray } from "./common.utils";
import {
  clusterTermType,
  normalizeCandidateType,
  operationsOf,
  suggestionOf,
} from "./candidateCluster.core";

const stringArray = (value: unknown): string[] => asArray(value as string[]).map((item) => String(item)).filter(Boolean);

const aliasText = (alias: unknown) => {
  if (typeof alias === "string" || typeof alias === "number") return String(alias).trim();
  const value = alias as Record<string, unknown> | null | undefined;
  return String(value?.aliasValue ?? value?.aliasName ?? value?.value ?? value?.name ?? "").trim();
};

const aliasTextList = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map(aliasText)
    .filter(Boolean);

export function normalizeCluster(value: CandidateCluster): CandidateCluster {
  const suggestion = suggestionOf(value);
  const defaultTermType = clusterTermType(value);
  return {
    ...value,
    id: value.id ?? value.clusterId ?? value.cluster_id,
    clusterId: value.clusterId ?? value.cluster_id ?? value.id,
    clusterKey: value.clusterKey ?? value.cluster_key,
    candidateType: normalizeCandidateType(value.candidateType ?? value.candidate_type),
    termType: defaultTermType,
    normalizedFieldName: value.normalizedFieldName ?? value.normalized_field_name,
    normalizedRawValue: value.normalizedRawValue ?? value.normalized_raw_value,
    candidateIds: asArray(value.candidateIds ?? value.candidate_ids),
    documentCount: Number(value.documentCount ?? value.document_count ?? 0),
    occurrenceCount: Number(value.occurrenceCount ?? value.occurrence_count ?? 0),
    sourceProductType: value.sourceProductType ?? value.source_product_type,
    rawFieldNameSamples: stringArray(value.rawFieldNameSamples ?? value.raw_field_name_samples),
    rawValueSamples: stringArray(value.rawValueSamples ?? value.raw_value_samples),
    commonContexts: stringArray(value.commonContexts ?? value.common_contexts),
    sampleOccurrences: asArray(value.sampleOccurrences ?? value.sample_occurrences),
    reviewSuggestion: suggestion,
    batchOperationsPreview: operationsOf(
      value.batchOperationsPreview ?? value.batch_operations_preview ?? suggestion?.batchOperationsPreview ?? suggestion?.batch_operations_preview,
      defaultTermType,
    ),
  };
}

export function clustersFromResponse(response: unknown): CandidateCluster[] {
  const value = response as any;
  const raw = Array.isArray(value) ? value : value?.candidateClusters ?? value?.clusters ?? value?.items ?? value?.data ?? [];
  return asArray(raw as CandidateCluster[]).map(normalizeCluster).sort((a, b) => {
    const documentDelta = Number(b.documentCount ?? 0) - Number(a.documentCount ?? 0);
    if (documentDelta !== 0) return documentDelta;
    return Number(b.occurrenceCount ?? 0) - Number(a.occurrenceCount ?? 0);
  });
}

export function termTypeSetFromClusterResponse(response: unknown) {
  const value = response as any;
  const termTypes = asArray(value?.options?.termTypes ?? value?.termTypes);
  return new Set(
    termTypes
      .map((item: any) => String(item?.termType ?? item?.term_type ?? ""))
      .filter(Boolean),
  );
}

export function dictionaryOptionsFromClusterResponse(response: unknown): DictionaryOptions {
  const value = response as any;
  const enumValues = asArray(value?.options?.enumValues ?? value?.enumValues).map((item: any) => ({
    ...item,
    id: item.id ?? item.termId ?? item.term_id ?? item.valueId ?? item.value_id,
    termType: item.termType ?? item.term_type ?? item.normalizedFieldName ?? item.normalized_field_name ?? item.fieldName ?? item.field_name,
    canonicalValue: item.canonicalValue ?? item.canonical_value ?? item.value ?? item.enumValue ?? item.enum_value,
    displayName: item.displayName ?? item.display_name ?? item.label ?? item.canonicalValue ?? item.canonical_value ?? item.value,
    aliasNames: aliasTextList(item.aliasNames ?? item.alias_names ?? item.aliases),
  }));
  return {
    termTypes: asArray(value?.options?.termTypes ?? value?.termTypes),
    values: enumValues,
    productTypes: asArray(value?.options?.productTypes ?? value?.productTypes),
  };
}

export function promptDataFromClusterResponse(response: unknown): CandidateClusterPromptData {
  const value = response as any;
  return {
    productTypes: asArray(value?.options?.productTypes ?? value?.productTypes),
    termTypes: asArray(value?.options?.termTypes ?? value?.termTypes),
    enumValues: asArray(value?.options?.enumValues ?? value?.enumValues),
    priorDecisions: asArray(value?.priorDecisions ?? value?.prior_decisions),
    runPolicy: value?.options?.runPolicy ?? value?.runPolicy ?? value?.run_policy,
  };
}
