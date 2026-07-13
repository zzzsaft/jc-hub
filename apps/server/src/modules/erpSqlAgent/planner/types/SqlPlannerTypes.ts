import type { SchemaRetrieverOptions } from "../../schema/service/SchemaRetrieverService.js";
import type { SchemaField, SchemaRetrieverResult, SchemaTable } from "../../schema/types/schemaTypes.js";
import type { ErpSqlIntent } from "../../intent/index.js";
import type {
  CompanyRules,
  DateSafetyRange,
  ErpModuleName,
  ErpModuleRule,
  JoinRule,
  ModuleDateRule,
  PromptRules,
  QualityRules,
  StatusRule,
} from "../../knowledge/types/ErpKnowledge.types.js";

export type QueryIntent = "lookup" | "list" | "aggregate" | "trend" | "unknown";
export type QueryPlanScenario = "purchaseSpendByType" | "purchaseDelayVendor" | "purchaseDetail" | "openJob" | "inventoryBalance" | "recentInventoryTran" | "salesBackorder" | "generic";

export type QueryPlanFilter = {
  table?: string;
  field?: string;
  expression: string;
};

export type QueryPlanMetric = {
  expression: string;
  alias: string;
};

export type QueryPlanOrderBy = {
  expression: string;
  direction?: "ASC" | "DESC";
};

export type AnalysisPlanMode = "strict" | "decision_support";
export type AnalysisPlanRoute = "complex_composed" | "clarification_required";

export type AnalysisPlanTimeRange =
  | { kind: "current_year" }
  | { kind: "year_over_year" }
  | { kind: "current_month" }
  | { kind: "previous_month" }
  | { kind: "month"; month?: number }
  | { kind: "relative"; days?: number };

export type AnalysisPlanComparison = {
  kind: "year_over_year" | "month_over_month";
};

export type AnalysisConversationContext = {
  recentMessages: Array<{ id?: string; role: "user" | "assistant"; content: string }>;
  semanticSummary?: string;
  summarizedMessageCount?: number;
};

export type AnalysisPlanDimensionRule = {
  dimension: "product_category";
  target: string;
  members: string[];
  source: "user_statement";
  trust: "user_asserted";
  validation: "master_data_required";
};

export type AnalysisPlanFilter = {
  metric: string;
  op: "rank_high" | "rank_low" | "high" | "low" | "overdue";
};

export type AnalysisPlanDimensionFilter = "customer" | "order" | "supplier" | "product" | "warehouse" | "job" | "product_category";
export type AnalysisPlanDimensionFilters = Partial<Record<AnalysisPlanDimensionFilter, string>>;

export type AnalysisPlan = {
  route?: AnalysisPlanRoute;
  mode: AnalysisPlanMode;
  grain: string[];
  metrics: string[];
  filters: AnalysisPlanFilter[];
  dimensions: string[];
  orderBy: Array<{ metric: string; direction: "ASC" | "DESC" }>;
  scenario?: string;
  timeRange?: AnalysisPlanTimeRange;
  comparison?: AnalysisPlanComparison;
  timeGrain?: "month" | "year";
  analysisShape?: "trend" | "concentration";
  limit?: number;
  requiredMetrics?: string[];
  missingApprovedMetrics?: string[];
  assumptions?: string[];
  clarificationCandidates?: string[];
  retrievalHints?: string[];
  dimensionFilters?: AnalysisPlanDimensionFilters;
  customerName?: string;
  businessScope?: Array<{ metric: string; source: "approved_metric" }>;
  dimensionRules?: AnalysisPlanDimensionRule[];
  contextInheritance?: {
    sourceTraceId?: string;
    inheritedFields: string[];
  };
};

export type CapabilityDecision = {
  outcome: "execute" | "clarify" | "unsupported";
  capability: string;
  missingCoverage: string[];
  reasonCode?: string;
};

export type AnalysisScenarioRecipe = {
  code: string;
  patterns: RegExp[];
  requiredMetrics: string[];
  optionalMetrics: string[];
  supportedDimensions: string[];
  defaultOrderBy?: { metric: string; direction: "ASC" | "DESC" };
  timeGrain?: "month" | "year";
  analysisShape?: "trend" | "concentration";
  strictExecutable: boolean;
};

export type AnalysisPlannerResult = {
  analysisPlan?: AnalysisPlan;
  clarificationQuestions: string[];
  warnings: string[];
};

export type SqlPlannerSchemaRetriever = {
  retrieve(query: string, options?: SchemaRetrieverOptions): Promise<SchemaRetrieverResult>;
};

export type SqlPlannerKnowledgeRepository = {
  getAllModules(): ErpModuleRule[];
  getModule(module: ErpModuleName): ErpModuleRule | undefined;
  getJoinRules(module: ErpModuleName): JoinRule[];
  getDateRules(): { globalSafetyRange: DateSafetyRange; moduleDateFields: ModuleDateRule[] };
  getDateRules(module: ErpModuleName): ModuleDateRule | undefined;
  getStatusRules(module: ErpModuleName): StatusRule[];
  getQualityRules(): QualityRules;
  getCompanyRules(): CompanyRules;
  getPromptRules(): PromptRules;
};

export type QueryPlanModule = {
  module: ErpModuleName;
  label: string;
  score: number;
  reasons: string[];
  rule: ErpModuleRule;
};

export type QueryPlanSchemaTable = {
  schemaName: string;
  tableName: string;
  label: string | null;
  score: number;
  source: "retriever" | "knowledge";
};

export type QueryPlanSchemaField = {
  schemaName: string;
  tableName: string;
  fieldName: string;
  label: string | null;
  dataType: string | null;
  source: "retriever";
};

export type QueryPlanKnowledge = {
  modules: ErpModuleRule[];
  joins: JoinRule[];
  dateRules: {
    globalSafetyRange: DateSafetyRange;
    moduleDateFields: ModuleDateRule[];
  };
  statusRules: StatusRule[];
  qualityRules: QualityRules;
  companyRules: CompanyRules;
  promptRules: PromptRules;
};

export type QueryPlanConstraints = {
  schemaName: "Erp";
  requireCompany: boolean;
  defaultLimit: number;
  requiresDateSafetyRange: boolean;
  recommendedStatusFilters: Array<Pick<StatusRule, "module" | "table" | "field" | "behavior" | "defaultPredicate">>;
};

export type QueryPlan = {
  question: string;
  intent: QueryIntent;
  scenario: QueryPlanScenario;
  extractedIntent?: ErpSqlIntent;
  modules: QueryPlanModule[];
  schema: {
    result: SchemaRetrieverResult;
    selectedTables: QueryPlanSchemaTable[];
    selectedFields: QueryPlanSchemaField[];
  };
  knowledge: QueryPlanKnowledge;
  constraints: QueryPlanConstraints;
  warnings: string[];
  missingRequiredFields: string[];
  confidence: number;
  keywordFilters?: QueryPlanFilter[];
  groupBy?: string[];
  orderBy?: QueryPlanOrderBy[];
  metrics?: QueryPlanMetric[];
};

export function toPlanTable(table: SchemaTable, score: number, source: QueryPlanSchemaTable["source"]): QueryPlanSchemaTable {
  return {
    schemaName: table.schemaName,
    tableName: table.tableName,
    label: table.tableLabel,
    score,
    source,
  };
}

export function toPlanField(field: SchemaField): QueryPlanSchemaField {
  return {
    schemaName: field.schemaName,
    tableName: field.tableName,
    fieldName: field.fieldName,
    label: field.fieldLabel,
    dataType: field.dataType,
    source: "retriever",
  };
}
