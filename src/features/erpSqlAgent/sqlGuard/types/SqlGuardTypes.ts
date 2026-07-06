export type SqlGuardResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedSql?: string;
  referencedTables: string[];
  referencedFields: string[];
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
};
