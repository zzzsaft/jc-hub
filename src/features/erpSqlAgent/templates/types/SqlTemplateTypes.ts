import type { ErpSqlQueryResult, ErpSqlQueryValue } from "../../query/index.js";
import type { SqlGuardResult } from "../../sqlGuard/index.js";

export type SqlTemplateParamSpec = {
  type?: "string" | "number" | "boolean";
  sqlType?: string;
  field?: string;
  required?: boolean;
  description?: string;
};

export type SqlTemplateParamMap = Record<string, SqlTemplateParamSpec>;

export type SqlTemplateDatasetInput = {
  datasetName?: string;
  datasetType: "query" | "formula_sql";
  connectionName?: string;
  rawSql: string;
  sqlHash: string;
  dynamicParams: string[];
  riskFlags: string[];
};

export type SqlTemplateReportFileInput = {
  filePath: string;
  relativePath: string;
  extension: string;
  fileHash: string;
  fileSize: bigint;
  reportName?: string;
  datasets: SqlTemplateDatasetInput[];
};

export type FineReportImportResult = {
  rootDir: string;
  extensions: string[];
  dryRun: boolean;
  fileCount: number;
  datasetCount: number;
  errorCount: number;
  errors: Array<{ filePath?: string; message: string }>;
  files: SqlTemplateReportFileInput[];
};

export type TemplateDraftInput = {
  datasetId: bigint;
  name?: string;
  intent: string;
  module: string;
  questionPattern?: string;
  normalizedQuestion?: string;
};

export type TemplateExecutionInput = {
  templateId: bigint;
  params: Record<string, ErpSqlQueryValue>;
  maxRows?: number;
};

export type TemplateExecutionResult = ErpSqlQueryResult & {
  executed: boolean;
  valid: boolean;
  sql: string;
  warnings: string[];
  error?: string;
};

export type TemplateGuardResult = SqlGuardResult & {
  guardPassed: boolean;
};

export type SqlTemplateAnalysisDataset = {
  id: bigint;
  datasetName: string | null;
  rawSql: string;
  sqlHash: string;
  dynamicParams: unknown;
  riskFlags: unknown;
  reportFile: {
    reportName: string | null;
    relativePath: string;
  };
};
