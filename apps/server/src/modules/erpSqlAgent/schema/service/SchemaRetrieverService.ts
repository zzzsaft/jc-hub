import { schemaRepository, type SchemaRepositorySearchOptions } from "../repository/SchemaRepository.js";
import { tokenizeSchemaQuery } from "../utils/keyword.js";
import { schemaFieldKey, schemaObjectKey } from "../../sqlGuard/utils/sqlText.js";
import type {
  SchemaField,
  SchemaRetrieverResult,
  SchemaRetrieverTableResult,
  SchemaTable,
} from "../types/schemaTypes.js";
import { throwIfAborted } from "../../../../lib/abort.js";

export type SchemaRetrieverOptions = SchemaRepositorySearchOptions & {
  fieldLimit?: number;
  signal?: AbortSignal;
};

type ScoredTable = SchemaTable & { score: number };
type ScoredField = SchemaField & { score: number };

export class SchemaRetrieverService {
  /** Retrieves relevant ERP tables and fields for a natural-language schema query. */
  async retrieve(query: string, options?: SchemaRetrieverOptions): Promise<SchemaRetrieverResult> {
    throwIfAborted(options?.signal);
    const keywords = tokenizeSchemaQuery(query);
    if (keywords.length === 0) {
      return { query, keywords, tables: [], fields: [], score: 0 };
    }

    const tableLimit = options?.limit ?? 10;
    const fieldLimit = options?.fieldLimit ?? 30;
    const [scoredTables, scoredFields] = await Promise.all([
      schemaRepository.scoreTables(keywords, { schemaName: options?.schemaName, limit: tableLimit }),
      schemaRepository.scoreFields(keywords, { schemaName: options?.schemaName, limit: fieldLimit }),
    ]);
    throwIfAborted(options?.signal);

    const tableScoreMap = buildTableScoreMap(scoredTables, scoredFields);
    const rankedTableKeys = [...tableScoreMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, tableLimit)
      .map(([key]) => key);

    const tableResults = await Promise.all(
      rankedTableKeys.map((key) => this.buildTableResult(key, tableScoreMap.get(key) ?? 0, scoredTables, scoredFields)),
    );
    throwIfAborted(options?.signal);
    const fields = dedupeFields(scoredFields);
    const score = [...tableScoreMap.values()].reduce((sum, value) => sum + value, 0);

    return {
      query,
      keywords,
      tables: tableResults.filter((result): result is SchemaRetrieverTableResult => result !== null),
      fields,
      score,
    };
  }

  /** Builds one retriever table result with the best matched fields for that table. */
  private async buildTableResult(
    tableKey: string,
    score: number,
    scoredTables: ScoredTable[],
    scoredFields: ScoredField[],
  ): Promise<SchemaRetrieverTableResult | null> {
    const table = scoredTables.find((item) => schemaObjectKey(item.schemaName, item.tableName) === tableKey);
    const tableWithFields = table
      ? await schemaRepository.findTableWithFields(table.schemaName, table.tableName)
      : await this.findTableFromFieldMatch(tableKey, scoredFields);

    if (!tableWithFields) {
      return null;
    }

    const matchedFields = scoredFields.filter((field) => schemaObjectKey(field.schemaName, field.tableName) === tableKey);
    const matchedFieldNames = new Set(matchedFields.map((field) => field.fieldName));
    const fields = [
      ...matchedFields,
      ...tableWithFields.fields.filter((field) => matchedFieldNames.has(field.fieldName)),
    ];

    return {
      table: tableWithFields,
      fields: dedupeFields(fields).slice(0, 12),
      score,
    };
  }

  /** Finds table metadata for a table that was discovered only through field matches. */
  private async findTableFromFieldMatch(tableKey: string, scoredFields: ScoredField[]) {
    const field = scoredFields.find((item) => schemaObjectKey(item.schemaName, item.tableName) === tableKey);
    if (!field) {
      return null;
    }
    return schemaRepository.findTableWithFields(field.schemaName, field.tableName);
  }
}

/** Aggregates table and field scores into per-table ranking scores. */
function buildTableScoreMap(scoredTables: ScoredTable[], scoredFields: ScoredField[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const table of scoredTables) {
    const key = schemaObjectKey(table.schemaName, table.tableName);
    scores.set(key, Math.max(scores.get(key) ?? 0, table.score));
  }
  for (const field of scoredFields) {
    const key = schemaObjectKey(field.schemaName, field.tableName);
    scores.set(key, (scores.get(key) ?? 0) + field.score);
  }
  return scores;
}

/** Deduplicates fields by schema, table, and field name. */
function dedupeFields<T extends SchemaField>(fields: T[]): T[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = schemaFieldKey(field.schemaName, field.tableName, field.fieldName);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export const schemaRetrieverService = new SchemaRetrieverService();
