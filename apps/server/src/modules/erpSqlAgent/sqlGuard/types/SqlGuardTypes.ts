export type SqlGuardResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedSql?: string;
  referencedTables: string[];
  referencedFields: string[];
};

export type SqlGuardReferenceHint = {
  familyId?: string;
  sourceType?: "dataset" | "family" | "metric" | "template";
  exampleSql?: string;
  sqlPreview?: string;
  metricCode?: string;
  metricName?: string;
  definitionJson?: unknown;
};

export type FinanceSqlMode = "strict" | "estimate";

export type SqlGuardOptions = {
  module?: string | null;
  references?: SqlGuardReferenceHint[];
  financeMode?: FinanceSqlMode;
  signal?: AbortSignal;
};

export type SqlGuardSchemaRepository = {
  /** Checks whether a physical ERP schema table exists. */
  tableExists(schemaName: string, tableName: string): Promise<boolean>;

  /** Checks whether a physical ERP schema field exists on one table. */
  fieldExists(schemaName: string, tableName: string, fieldName: string): Promise<boolean>;
};

export type ReferencedTable = {
  schemaName: string;
  tableName: string;
  alias?: string;
  cte: boolean;
};

export type ReferencedField = {
  fieldName: string;
  qualifier?: string;
  derived?: boolean;
};
