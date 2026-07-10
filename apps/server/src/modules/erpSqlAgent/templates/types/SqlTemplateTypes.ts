import type { ErpSqlQueryResult, ErpSqlQueryValue } from "../../query/index.js";
import type { AnalysisPlan, QueryPlan } from "../../planner/index.js";
import type { SqlSemanticGuardResult } from "../../runtimeGuard/index.js";
import type { SqlGuardResult } from "../../sqlGuard/index.js";
import type { FinanceSqlMode } from "../../sqlGuard/index.js";
import type { ErpSqlAccessAuditReason, ErpSqlAccessScope } from "../../access/index.js";

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
  accessScope?: ErpSqlAccessScope;
  module?: string;
  signal?: AbortSignal;
  dryRun?: boolean;
  runtimeContext?: {
    question: string;
    queryPlan?: QueryPlan;
    analysisPlan?: AnalysisPlan;
    financeMode?: FinanceSqlMode;
    lowConfidence?: boolean;
  };
};

export type TemplateExecutionResult = ErpSqlQueryResult & {
  executed: boolean;
  valid: boolean;
  sql: string;
  warnings: string[];
  auditReasons?: ErpSqlAccessAuditReason[];
  error?: string;
  /** Internal-only rejected candidate. Ordinary logs and user responses must omit it. */
  candidateSql?: string;
  guardResult?: SqlGuardResult;
  semanticResult?: SqlSemanticGuardResult;
  audit?: {
    renderedSqlHash: string;
    templateId: string;
    bindingParams: Record<string, unknown>;
  };
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
