import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import { schemaFieldKey, schemaObjectKey } from "../../sqlGuard/utils/sqlText.js";
import { escapeLikePattern } from "../utils/keyword.js";
import type {
  SchemaField,
  SchemaFieldImportInput,
  SchemaTable,
  SchemaTableImportInput,
  SchemaTableWithFields,
} from "../types/schemaTypes.js";

export type SchemaRepositorySearchOptions = {
  schemaName?: string;
  limit?: number;
};

export type SchemaRepositoryFieldLookup = {
  schemaName?: string;
  tableName?: string;
  fieldName?: string;
  dbFieldName?: string;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class SchemaRepository {
  private readonly tableWithFieldsCache = new Map<string, Promise<SchemaTableWithFields | null>>();
  private readonly tableExistsCache = new Map<string, Promise<boolean>>();
  private readonly fieldExistsCache = new Map<string, Promise<boolean>>();

  /** Finds one ERP schema table by schema and table name. */
  async findTable(schemaName: string, tableName: string): Promise<SchemaTable | null> {
    return prisma.erpSchemaTable.findUnique({
      where: { schemaName_tableName: { schemaName, tableName } },
    });
  }

  /** Finds one ERP schema field by table plus field name or DB field name. */
  async findField(params: SchemaRepositoryFieldLookup): Promise<SchemaField | null> {
    const schemaName = params.schemaName ?? "Erp";
    if (!params.tableName || (!params.fieldName && !params.dbFieldName)) {
      return null;
    }

    return prisma.erpSchemaField.findFirst({
      where: {
        schemaName,
        tableName: params.tableName,
        OR: [
          ...(params.fieldName ? [{ fieldName: params.fieldName }] : []),
          ...(params.dbFieldName ? [{ dbFieldName: params.dbFieldName }] : []),
        ],
      },
      orderBy: { id: "asc" },
    });
  }

  /** Searches tables by keyword across table name, label, and description. */
  async findTablesByKeyword(keyword: string, options?: SchemaRepositorySearchOptions): Promise<SchemaTable[]> {
    const limit = normalizeLimit(options?.limit);
    return prisma.erpSchemaTable.findMany({
      where: {
        ...(options?.schemaName ? { schemaName: options.schemaName } : {}),
        OR: [
          { tableName: { contains: keyword, mode: "insensitive" } },
          { tableLabel: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      },
      orderBy: [{ tableName: "asc" }],
      take: limit,
    });
  }

  /** Searches fields by keyword across field name, DB field name, label, and description. */
  async findFieldsByKeyword(keyword: string, options?: SchemaRepositorySearchOptions): Promise<SchemaField[]> {
    const limit = normalizeLimit(options?.limit);
    return prisma.erpSchemaField.findMany({
      where: {
        ...(options?.schemaName ? { schemaName: options.schemaName } : {}),
        OR: [
          { fieldName: { contains: keyword, mode: "insensitive" } },
          { dbFieldName: { contains: keyword, mode: "insensitive" } },
          { fieldLabel: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      },
      orderBy: [{ tableName: "asc" }, { fieldName: "asc" }],
      take: limit,
    });
  }

  /** Returns a table and its fields as a single typed aggregate. */
  async findTableWithFields(schemaName: string, tableName: string): Promise<SchemaTableWithFields | null> {
    const key = schemaObjectKey(schemaName, tableName);
    let cached = this.tableWithFieldsCache.get(key);
    if (!cached) {
      cached = this.findTableWithFieldsUncached(schemaName, tableName).catch((error: unknown) => {
        this.tableWithFieldsCache.delete(key);
        throw error;
      });
      this.tableWithFieldsCache.set(key, cached);
    }
    return cached;
  }

  /** Checks whether a table exists in the ERP schema cache. */
  async tableExists(schemaName: string, tableName: string): Promise<boolean> {
    const key = schemaObjectKey(schemaName, tableName);
    let cached = this.tableExistsCache.get(key);
    if (!cached) {
      cached = prisma.erpSchemaTable.count({ where: { schemaName, tableName } }).then((count) => count > 0).catch((error: unknown) => {
        this.tableExistsCache.delete(key);
        throw error;
      });
      this.tableExistsCache.set(key, cached);
    }
    return cached;
  }

  /** Checks whether a field exists in the ERP schema cache. */
  async fieldExists(schemaName: string, tableName: string, fieldName: string): Promise<boolean> {
    const key = schemaFieldKey(schemaName, tableName, fieldName);
    let cached = this.fieldExistsCache.get(key);
    if (!cached) {
      cached = prisma.erpSchemaField.count({
        where: {
          schemaName,
          tableName,
          OR: [
            { fieldName: { equals: fieldName, mode: "insensitive" } },
            { dbFieldName: { equals: fieldName, mode: "insensitive" } },
          ],
        },
      }).then((count) => count > 0).catch((error: unknown) => {
        this.fieldExistsCache.delete(key);
        throw error;
      });
      this.fieldExistsCache.set(key, cached);
    }
    return cached;
  }

  /** Bulk upserts normalized table metadata rows. */
  async upsertTables(rows: SchemaTableImportInput[]): Promise<number> {
    const uniqueRows = dedupeByKey(rows, (row) => `${row.schemaName}.${row.tableName}`);
    if (uniqueRows.length === 0) {
      return 0;
    }

    await prisma.$executeRaw(
      Prisma.sql`
        insert into "erp_agent"."erp_schema_tables" (
          "schema_name",
          "table_name",
          "description",
          "table_label",
          "system_code",
          "table_type",
          "data_table_id"
        )
        values ${Prisma.join(uniqueRows.map((row) => Prisma.sql`(
          ${row.schemaName},
          ${row.tableName},
          ${row.description},
          ${row.tableLabel},
          ${row.systemCode},
          ${row.tableType},
          ${row.dataTableId}
        )`))}
        on conflict ("schema_name", "table_name") do update set
          "description" = excluded."description",
          "table_label" = excluded."table_label",
          "system_code" = excluded."system_code",
          "table_type" = excluded."table_type",
          "data_table_id" = excluded."data_table_id",
          "updated_at" = CURRENT_TIMESTAMP
      `,
    );
    this.clearCaches();
    return uniqueRows.length;
  }

  /** Bulk upserts normalized field metadata rows. */
  async upsertFields(rows: SchemaFieldImportInput[]): Promise<number> {
    const uniqueRows = dedupeByKey(rows, (row) => `${row.schemaName}.${row.tableName}.${row.fieldName}`);
    if (uniqueRows.length === 0) {
      return 0;
    }

    await prisma.$executeRaw(
      Prisma.sql`
        insert into "erp_agent"."erp_schema_fields" (
          "schema_name",
          "table_name",
          "field_name",
          "db_field_name",
          "field_label",
          "description",
          "data_type",
          "required",
          "read_only",
          "use_db_default",
          "tooltip_text",
          "is_description_field",
          "like_data_field_name"
        )
        values ${Prisma.join(uniqueRows.map((row) => Prisma.sql`(
          ${row.schemaName},
          ${row.tableName},
          ${row.fieldName},
          ${row.dbFieldName},
          ${row.fieldLabel},
          ${row.description},
          ${row.dataType},
          ${row.required},
          ${row.readOnly},
          ${row.useDbDefault},
          ${row.tooltipText},
          ${row.isDescriptionField},
          ${row.likeDataFieldName}
        )`))}
        on conflict ("schema_name", "table_name", "field_name") do update set
          "db_field_name" = excluded."db_field_name",
          "field_label" = excluded."field_label",
          "description" = excluded."description",
          "data_type" = excluded."data_type",
          "required" = excluded."required",
          "read_only" = excluded."read_only",
          "use_db_default" = excluded."use_db_default",
          "tooltip_text" = excluded."tooltip_text",
          "is_description_field" = excluded."is_description_field",
          "like_data_field_name" = excluded."like_data_field_name",
          "updated_at" = CURRENT_TIMESTAMP
      `,
    );
    this.clearCaches();
    return uniqueRows.length;
  }

  /** Scores tables for a natural-language query using weighted PostgreSQL LIKE matches. */
  async scoreTables(keywords: string[], options?: SchemaRepositorySearchOptions): Promise<Array<SchemaTable & { score: number }>> {
    if (keywords.length === 0) {
      return [];
    }

    const limit = normalizeLimit(options?.limit);
    const patterns = keywords.map((keyword) => `%${escapeLikePattern(keyword)}%`);
    const schemaName = options?.schemaName ?? null;
    return prisma.$queryRaw<Array<SchemaTable & { score: number }>>(Prisma.sql`
      select
        "id",
        "schema_name" as "schemaName",
        "table_name" as "tableName",
        "description",
        "table_label" as "tableLabel",
        "system_code" as "systemCode",
        "table_type" as "tableType",
        "data_table_id" as "dataTableId",
        "created_at" as "createdAt",
        "updated_at" as "updatedAt",
        (
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where "table_name" ilike pattern escape '\\') then 60 else 0 end +
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where coalesce("table_label", '') ilike pattern escape '\\') then 35 else 0 end +
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where coalesce("description", '') ilike pattern escape '\\') then 20 else 0 end
        )::int as "score"
      from "erp_agent"."erp_schema_tables"
      where (${schemaName}::text is null or "schema_name" = ${schemaName})
        and exists (
          select 1 from unnest(${patterns}::text[]) pattern
          where "table_name" ilike pattern escape '\\'
             or coalesce("table_label", '') ilike pattern escape '\\'
             or coalesce("description", '') ilike pattern escape '\\'
        )
      order by "score" desc, "table_name" asc
      limit ${limit}
    `);
  }

  /** Scores fields for a natural-language query using weighted PostgreSQL LIKE matches. */
  async scoreFields(keywords: string[], options?: SchemaRepositorySearchOptions): Promise<Array<SchemaField & { score: number }>> {
    if (keywords.length === 0) {
      return [];
    }

    const limit = normalizeLimit(options?.limit);
    const patterns = keywords.map((keyword) => `%${escapeLikePattern(keyword)}%`);
    const schemaName = options?.schemaName ?? null;
    return prisma.$queryRaw<Array<SchemaField & { score: number }>>(Prisma.sql`
      select
        "id",
        "schema_name" as "schemaName",
        "table_name" as "tableName",
        "field_name" as "fieldName",
        "db_field_name" as "dbFieldName",
        "field_label" as "fieldLabel",
        "description",
        "data_type" as "dataType",
        "required",
        "read_only" as "readOnly",
        "use_db_default" as "useDbDefault",
        "tooltip_text" as "tooltipText",
        "is_description_field" as "isDescriptionField",
        "like_data_field_name" as "likeDataFieldName",
        "created_at" as "createdAt",
        "updated_at" as "updatedAt",
        (
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where "field_name" ilike pattern escape '\\') then 45 else 0 end +
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where coalesce("db_field_name", '') ilike pattern escape '\\') then 40 else 0 end +
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where coalesce("field_label", '') ilike pattern escape '\\') then 25 else 0 end +
          case when exists (select 1 from unnest(${patterns}::text[]) pattern where coalesce("description", '') ilike pattern escape '\\') then 15 else 0 end
        )::int as "score"
      from "erp_agent"."erp_schema_fields"
      where (${schemaName}::text is null or "schema_name" = ${schemaName})
        and exists (
          select 1 from unnest(${patterns}::text[]) pattern
          where "field_name" ilike pattern escape '\\'
             or coalesce("db_field_name", '') ilike pattern escape '\\'
             or coalesce("field_label", '') ilike pattern escape '\\'
             or coalesce("description", '') ilike pattern escape '\\'
        )
      order by "score" desc, "table_name" asc, "field_name" asc
      limit ${limit}
    `);
  }

  private async findTableWithFieldsUncached(schemaName: string, tableName: string): Promise<SchemaTableWithFields | null> {
    const table = await this.findTable(schemaName, tableName);
    if (!table) {
      return null;
    }

    const fields = await prisma.erpSchemaField.findMany({
      where: { schemaName, tableName },
      orderBy: { fieldName: "asc" },
    });
    return { ...table, fields };
  }

  private clearCaches(): void {
    this.tableWithFieldsCache.clear();
    this.tableExistsCache.clear();
    this.fieldExistsCache.clear();
  }
}

/** Normalizes query limits to protect database calls from oversized requests. */
function normalizeLimit(limit: number | undefined): number {
  return Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));
}

/** Deduplicates batch rows by unique upsert key while keeping the latest CSV row. */
function dedupeByKey<T>(rows: T[], getKey: (row: T) => string): T[] {
  return [...new Map(rows.map((row) => [getKey(row), row])).values()];
}

export const schemaRepository = new SchemaRepository();
