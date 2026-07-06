import type { ErpSchemaField, ErpSchemaTable } from "@prisma/client";

export type SchemaTable = ErpSchemaTable;

export type SchemaField = ErpSchemaField;

export type SchemaTableWithFields = SchemaTable & {
  fields: SchemaField[];
};

export type SchemaSearchResult = {
  tables: SchemaTable[];
  fields: SchemaField[];
  score: number;
};

export type SchemaRetrieverTableResult = {
  table: SchemaTable;
  fields: SchemaField[];
  score: number;
};

export type SchemaRetrieverResult = {
  query: string;
  keywords: string[];
  tables: SchemaRetrieverTableResult[];
  fields: SchemaField[];
  score: number;
};

export type SchemaImportStats = {
  processed: number;
  upserted: number;
};

export type SchemaTableImportInput = {
  schemaName: string;
  tableName: string;
  description: string | null;
  tableLabel: string | null;
  systemCode: string | null;
  tableType: string | null;
  dataTableId: string | null;
};

export type SchemaFieldImportInput = {
  schemaName: string;
  tableName: string;
  fieldName: string;
  dbFieldName: string | null;
  fieldLabel: string | null;
  description: string | null;
  dataType: string | null;
  required: boolean;
  readOnly: boolean;
  useDbDefault: boolean;
  tooltipText: string | null;
  isDescriptionField: boolean;
  likeDataFieldName: string | null;
};
