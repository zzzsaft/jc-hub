import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import {
  addSemanticTriageStats,
  emptySemanticTriageStats,
  getSemanticTriage,
} from "../dictionary/candidateSemanticTriage.js";

const DOCUMENT_INFO_PATTERN = /(document_info|客户|合同|订单|图纸|日期|交期|备注|说明|产品名称|产品规格|规格)/iu;
const KNOWN_STATUSES = new Set([
  "pending",
  "approved",
  "approved_alias",
  "rejected",
  "merged",
  "moved",
  "doc_info",
  "kind_updated",
  "split_suggested",
  "split",
  "needs_human_review",
]);

type TableColumns = Map<string, Set<string>>;

async function main() {
  const columns = await loadTableColumns();
  const missingColumns = {
    dictionary_term_types: missingCanonical(columns, "dictionary_term_types", [
      ["value_kind"],
    ]),
    dictionary_candidates: missingCanonical(columns, "dictionary_candidates", [
      ["normalized_raw_value"],
      ["proposed_canonical_value"],
      ["evidence"],
    ]),
    dictionary_candidate_occurrences: missingCanonical(columns, "dictionary_candidate_occurrences", [
      ["extraction_result_id"],
      ["item_index"],
      ["field_name"],
      ["raw_value_hash"],
      ["occurrence_hash"],
      ["evidence"],
    ]),
  };
  const legacyUnavailableColumns = {
    dictionary_term_types: missingCanonical(columns, "dictionary_term_types", [["kind"], ["metadata"]]),
    dictionary_candidates: missingCanonical(columns, "dictionary_candidates", [["occurrence_count"], ["metadata"]]),
    dictionary_candidate_occurrences: missingCanonical(columns, "dictionary_candidate_occurrences", [
      ["extraction_id"],
      ["field_path"],
      ["context_json"],
    ]),
  };

  const [termTypes, candidates, occurrences, statusRows] = await Promise.all([
    loadTermTypes(columns),
    loadCandidates(columns),
    loadOccurrences(columns),
    loadStatusRows(),
  ]);

  const policy = new Map(
    termTypes.map((termType) => {
      const metadata = objectRecord(termType.metadata);
      return [
        termType.term_type,
        {
          valueKind: String(metadata.valueKind ?? termType.kind ?? "text"),
          collectCandidates: metadata.collectCandidates === true,
        },
      ];
    }),
  );

  const occurrenceGroups = new Map<string, number>();
  for (const occurrence of occurrences) {
    const occurrenceHash =
      occurrence.occurrence_hash ??
      hash(
        [
          String(occurrence.candidate_type ?? ""),
          String(occurrence.candidate_id),
          String(occurrence.extraction_id ?? ""),
          String(occurrence.item_index ?? ""),
          String(occurrence.field_path ?? ""),
          occurrence.raw_value_hash ?? hash(normalizeCandidateRawValue(occurrence.raw_value)),
        ].join("\u0000"),
      );
    occurrenceGroups.set(occurrenceHash, (occurrenceGroups.get(occurrenceHash) ?? 0) + 1);
  }
  const duplicateOccurrenceCount = [...occurrenceGroups.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );

  const actualOccurrenceCounts = new Map<string, number>();
  for (const occurrence of occurrences) {
    const key = String(occurrence.candidate_id);
    actualOccurrenceCounts.set(key, (actualOccurrenceCounts.get(key) ?? 0) + 1);
  }
  const occurrenceCountMismatchCount = hasColumn(columns, "dictionary_candidates", "occurrence_count")
    ? candidates.filter(
        (candidate) => Number(candidate.occurrence_count ?? 0) !== (actualOccurrenceCounts.get(String(candidate.id)) ?? 0),
      ).length
    : null;

  const valueCandidates = candidates.filter((candidate) => {
    const metadata = objectRecord(candidate.metadata);
    return String(metadata.candidateType ?? inferCandidateType(candidate.term_type)) === "value";
  });
  const nonEnumValueCandidateCount = valueCandidates.filter((candidate) => {
    const valueKind = policy.get(candidate.term_type)?.valueKind ?? "text";
    return valueKind !== "enum" && valueKind !== "enums";
  }).length;
  const textValueCandidateCount = valueCandidates.filter((candidate) => {
    const termPolicy = policy.get(candidate.term_type);
    return (termPolicy?.valueKind ?? "text") === "text" && termPolicy?.collectCandidates !== true;
  }).length;
  const documentInfoSuspectedPollutionCount = valueCandidates.filter((candidate) => {
    const metadata = objectRecord(candidate.metadata);
    const text = [candidate.term_type, candidate.raw_value, metadata.firstFieldPath, JSON.stringify(metadata)].join(" ");
    return DOCUMENT_INFO_PATTERN.test(text);
  }).length;
  const abnormalStatusCounts = Object.fromEntries(
    statusRows
      .filter((row) => !KNOWN_STATUSES.has(String(row.status)))
      .map((row) => [String(row.status), Number(row.count)]),
  );
  const semanticTriageStats = emptySemanticTriageStats();
  for (const candidate of candidates) {
    const metadata = objectRecord(candidate.metadata);
    addSemanticTriageStats(semanticTriageStats, getSemanticTriage(metadata));
  }

  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        duplicateOccurrenceCount,
        occurrenceCountMismatchCount,
        nonEnumValueCandidateCount,
        textValueCandidateCount,
        documentInfoSuspectedPollutionCount,
        semanticTriageStats,
        abnormalStatusCounts,
        missingColumns,
        legacyUnavailableColumns,
        notes: {
          occurrenceCountMismatchCount:
            occurrenceCountMismatchCount === null
              ? "skipped because live agent.dictionary_candidates has no occurrence_count; Phase 1 reads occurrences as source of truth"
              : undefined,
        },
      },
      null,
      2,
    ),
  );
}

async function loadTableColumns(): Promise<TableColumns> {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
    `select table_name, column_name
     from information_schema.columns
     where table_schema = 'agent'
       and table_name in ('dictionary_term_types', 'dictionary_candidates', 'dictionary_candidate_occurrences')`,
  );
  const result: TableColumns = new Map();
  for (const row of rows) {
    const columns = result.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    result.set(row.table_name, columns);
  }
  return result;
}

async function loadTermTypes(columns: TableColumns) {
  const kindExpression = hasColumn(columns, "dictionary_term_types", "kind")
    ? `"kind"`
    : hasColumn(columns, "dictionary_term_types", "value_kind")
      ? `"value_kind" as "kind"`
      : `null::text as "kind"`;
  const metadataExpression = hasColumn(columns, "dictionary_term_types", "metadata")
    ? `"metadata"`
    : hasColumn(columns, "dictionary_term_types", "value_kind")
      ? `jsonb_build_object('valueKind', "value_kind") as "metadata"`
      : `'{}'::jsonb as "metadata"`;
  return prisma.$queryRawUnsafe<Array<{ term_type: string; kind: string | null; metadata: unknown }>>(
    `select "term_type", ${kindExpression}, ${metadataExpression}
     from "agent"."dictionary_term_types"`,
  );
}

async function loadCandidates(columns: TableColumns) {
  const occurrenceCountExpression = hasColumn(columns, "dictionary_candidates", "occurrence_count")
    ? `"occurrence_count"`
    : `null::integer as "occurrence_count"`;
  const metadataExpression = hasColumn(columns, "dictionary_candidates", "metadata")
    ? `"metadata"`
    : hasColumn(columns, "dictionary_candidates", "evidence")
      ? `"evidence" as "metadata"`
      : `'{}'::jsonb as "metadata"`;
  return prisma.$queryRawUnsafe<
    Array<{
      id: bigint;
      term_type: string;
      raw_value: string;
      occurrence_count: number | null;
      status: string;
      metadata: unknown;
    }>
  >(
    `select "id", "term_type", "raw_value", ${occurrenceCountExpression}, "status", ${metadataExpression}
     from "agent"."dictionary_candidates"`,
  );
}

async function loadOccurrences(columns: TableColumns) {
  const extractionIdExpression = hasColumn(columns, "dictionary_candidate_occurrences", "extraction_id")
    ? `"extraction_id"`
    : hasColumn(columns, "dictionary_candidate_occurrences", "extraction_result_id")
      ? `"extraction_result_id" as "extraction_id"`
      : `null::bigint as "extraction_id"`;
  const itemIndexExpression = hasColumn(columns, "dictionary_candidate_occurrences", "item_index")
    ? `"item_index"`
    : `null::integer as "item_index"`;
  const fieldPathExpression = hasColumn(columns, "dictionary_candidate_occurrences", "field_path")
    ? `"field_path"`
    : hasColumn(columns, "dictionary_candidate_occurrences", "field_name")
      ? `"field_name" as "field_path"`
      : `null::text as "field_path"`;
  const rawValueHashExpression = hasColumn(columns, "dictionary_candidate_occurrences", "raw_value_hash")
    ? `"raw_value_hash"`
    : `null::text as "raw_value_hash"`;
  const occurrenceHashExpression = hasColumn(columns, "dictionary_candidate_occurrences", "occurrence_hash")
    ? `"occurrence_hash"`
    : `null::text as "occurrence_hash"`;
  const contextJsonExpression = hasColumn(columns, "dictionary_candidate_occurrences", "context_json")
    ? `"context_json"`
    : hasColumn(columns, "dictionary_candidate_occurrences", "evidence")
      ? `"evidence" as "context_json"`
      : `'{}'::jsonb as "context_json"`;
  const candidateTypeExpression = hasColumn(columns, "dictionary_candidate_occurrences", "candidate_type")
    ? `"candidate_type"`
    : `null::text as "candidate_type"`;
  return prisma.$queryRawUnsafe<
    Array<{
      id: bigint;
      candidate_type: string | null;
      candidate_id: bigint;
      extraction_id: bigint | null;
      item_index: number | null;
      field_path: string | null;
      raw_value: string;
      raw_value_hash: string | null;
      occurrence_hash: string | null;
      context_json: unknown;
    }>
  >(
    `select "id", ${candidateTypeExpression}, "candidate_id", ${extractionIdExpression}, ${itemIndexExpression}, ${fieldPathExpression}, "raw_value",
            ${rawValueHashExpression}, ${occurrenceHashExpression}, ${contextJsonExpression}
     from "agent"."dictionary_candidate_occurrences"`,
  );
}

async function loadStatusRows() {
  return prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
    `select "status", count(*)::bigint as "count"
     from "agent"."dictionary_candidates"
     group by "status"
     order by "status"`,
  );
}

function hasColumn(columns: TableColumns, tableName: string, columnName: string): boolean {
  return columns.get(tableName)?.has(columnName) === true;
}

function missing(columns: TableColumns, tableName: string, columnNames: string[]): string[] {
  return columnNames.filter((columnName) => !hasColumn(columns, tableName, columnName));
}

function missingCanonical(columns: TableColumns, tableName: string, alternatives: string[][]): string[] {
  return alternatives
    .filter((columnNames) => !columnNames.some((columnName) => hasColumn(columns, tableName, columnName)))
    .map((columnNames) => columnNames.join("|"));
}

function normalizeCandidateRawValue(value: string): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function inferCandidateType(termType: string): "term_type" | "value" | "unit" {
  if (termType === "unit" || termType.endsWith("_unit")) return "unit";
  if (termType === "field" || termType === "term_type" || termType.startsWith("unknown_field")) return "term_type";
  return "value";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
