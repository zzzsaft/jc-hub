import { KnowledgeRepository } from "../../knowledge/index.js";
import type { ErpModuleName, ErpModuleRule, JoinRule, StatusRule } from "../../knowledge/types/ErpKnowledge.types.js";
import type { ErpSqlIntent } from "../../intent/index.js";
import { schemaRetrieverService } from "../../schema/index.js";
import type { SchemaRetrieverTableResult } from "../../schema/types/schemaTypes.js";
import { schemaObjectKey } from "../../sqlGuard/utils/sqlText.js";
import { SCENARIO_DATE_FIELDS, SCENARIO_TABLES } from "./scenarios.js";
import {
  toPlanField,
  toPlanTable,
  type QueryIntent,
  type QueryPlan,
  type QueryPlanFilter,
  type QueryPlanModule,
  type QueryPlanScenario,
  type QueryPlanSchemaTable,
  type SqlPlannerKnowledgeRepository,
  type SqlPlannerSchemaRetriever,
} from "../types/SqlPlannerTypes.js";

const SCHEMA_NAME = "Erp";
const MAX_MODULES = 3;
const MAX_TABLES = 12;
const MAX_FIELDS = 30;

export class SqlPlannerService {
  constructor(
    private readonly schemaRetriever: SqlPlannerSchemaRetriever = schemaRetrieverService,
    private readonly knowledgeRepository: SqlPlannerKnowledgeRepository = new KnowledgeRepository(),
  ) {}

  async plan(question: string, extractedIntent?: ErpSqlIntent, signal?: AbortSignal): Promise<QueryPlan> {
    const normalizedQuestion = (extractedIntent?.normalizedQuestion ?? question).trim();
    const [schema, allModules] = await Promise.all([
      this.schemaRetriever.retrieve(normalizedQuestion, { schemaName: SCHEMA_NAME, signal }),
      Promise.resolve(this.knowledgeRepository.getAllModules()),
    ]);

    const modules = pickModules(normalizedQuestion, allModules, extractedIntent).slice(0, MAX_MODULES);
    const primaryModules = modules.length > 0 ? modules : [];
    const globalDateRules = this.knowledgeRepository.getDateRules();
    const qualityRules = this.knowledgeRepository.getQualityRules();
    const companyRules = this.knowledgeRepository.getCompanyRules();
    const promptRules = this.knowledgeRepository.getPromptRules();
    const moduleNames = primaryModules.map((module) => module.module);
    const joinRules = moduleNames.flatMap((module) => this.knowledgeRepository.getJoinRules(module));
    const moduleDateFields = moduleNames
      .map((module) => this.knowledgeRepository.getDateRules(module))
      .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
    const statusRules = moduleNames.flatMap((module) => this.knowledgeRepository.getStatusRules(module));
    const planIntent = toQueryIntent(extractedIntent?.intentType) ?? inferIntent(normalizedQuestion);
    const dateSensitive = Boolean(extractedIntent?.dateRange) || isDateSensitiveQuestion(normalizedQuestion) || planIntent === "trend";
    const candidateTables = selectTables(schema.tables, primaryModules.map((module) => module.rule));
    const scenario = pickScenario(normalizedQuestion, planIntent, candidateTables, dateSensitive);
    const selectedTables = pickTables(candidateTables, scenario, joinRules);
    const selectedFields = schema.fields.slice(0, MAX_FIELDS).map(toPlanField);
    const filters = [...buildIntentFilters(extractedIntent), ...buildScenarioFilters(scenario, dateSensitive)];
    const warnings = [
      ...buildWarnings(normalizedQuestion, primaryModules, schema.tables.length, dateSensitive, moduleDateFields.length),
      ...(extractedIntent?.warnings ?? []),
      ...buildIntentWarnings(extractedIntent),
    ];
    const missingRequiredFields = companyRules.mustOutputCompany ? ["Company"] : [];

    return {
      question: normalizedQuestion,
      intent: planIntent,
      scenario,
      extractedIntent,
      modules: primaryModules,
      schema: {
        result: schema,
        selectedTables,
        selectedFields,
      },
      knowledge: {
        modules: primaryModules.map((module) => this.knowledgeRepository.getModule(module.module) ?? module.rule),
        joins: joinRules,
        dateRules: {
          globalSafetyRange: globalDateRules.globalSafetyRange,
          moduleDateFields,
        },
        statusRules,
        qualityRules,
        companyRules,
        promptRules,
      },
      constraints: {
        schemaName: SCHEMA_NAME,
        requireCompany: companyRules.mustOutputCompany,
        defaultLimit: normalizeLimit(extractedIntent?.limit, promptRules.defaultLimit),
        requiresDateSafetyRange: dateSensitive,
        recommendedStatusFilters: statusRules.filter(isDefaultStatusFilter).map(toRecommendedStatusFilter),
      },
      warnings,
      missingRequiredFields,
      confidence: calculateConfidence(primaryModules, schema.score),
      ...(filters.length > 0 ? { keywordFilters: filters } : {}),
    };
  }
}

function pickModules(question: string, modules: ErpModuleRule[], intent: ErpSqlIntent | undefined): QueryPlanModule[] {
  const scored = scoreModules(question, modules);
  if (!intent?.module || intent.module === "unknown") return scored;
  const rule = modules.find((module) => module.module === intent.module);
  if (!rule) return scored;
  return [
    { module: rule.module, label: rule.label, score: 100, reasons: ["DeepSeek intent module"], rule },
    ...scored.filter((module) => module.module !== rule.module),
  ];
}

function scoreModules(question: string, modules: ErpModuleRule[]): QueryPlanModule[] {
  const normalized = question.toLowerCase();
  return modules
    .map((rule) => {
      const reasons: string[] = [];
      let score = 0;
      score += scoreTerm(normalized, rule.module, 8, reasons);
      score += scoreTerm(normalized, rule.label, 8, reasons);
      score += scoreTerm(normalized, rule.description, 2, reasons);
      for (const keyword of rule.keywords) score += scoreTerm(normalized, keyword, 5, reasons);
      for (const table of rule.coreTables) score += scoreTerm(normalized, table, 4, reasons);
      return { module: rule.module, label: rule.label, score, reasons: [...new Set(reasons)], rule };
    })
    .filter((module) => module.score > 0)
    .sort((left, right) => right.score - left.score || left.module.localeCompare(right.module));
}

function scoreTerm(question: string, term: string, weight: number, reasons: string[]): number {
  const normalizedTerm = term.toLowerCase();
  if (!normalizedTerm || !question.includes(normalizedTerm)) return 0;
  reasons.push(term);
  return weight;
}

function toQueryIntent(intentType: ErpSqlIntent["intentType"]): QueryIntent | undefined {
  if (!intentType) return undefined;
  if (intentType === "trend") return "trend";
  if (intentType === "detail" || intentType === "trace") return "list";
  if (intentType === "summary" || intentType === "ranking" || intentType === "anomaly") return "aggregate";
  return undefined;
}

function inferIntent(question: string): QueryIntent {
  const normalized = question.toLowerCase();
  if (!normalized) return "unknown";
  if (/(趋势|trend|按月|按年|同比|环比)/i.test(normalized)) return "trend";
  if (/(count|sum|avg|max|min|统计|汇总|合计|总数|数量|金额|毛利|占比|多少|前\s*\d+|top|排名|最高|最低|较高|比较高)/i.test(normalized)) return "aggregate";
  if (/(列表|明细|list|列出|显示|查询)/i.test(normalized)) return "list";
  if (/(lookup|查找|查看|详情)/i.test(normalized)) return "lookup";
  return "unknown";
}

function buildIntentFilters(intent: ErpSqlIntent | undefined): QueryPlanFilter[] {
  if (!intent) return [];
  const filters: QueryPlanFilter[] = [];
  const moduleName = intent.module;
  const entities = intent.entities;

  if (entities.partNum) filters.push({ field: "PartNum", expression: `${partAlias(moduleName, intent.normalizedQuestion)}.PartNum = ${sqlString(entities.partNum)}` });
  if (entities.poNum !== undefined) filters.push({ table: "POHeader", field: "PONum", expression: `poh.PONum = ${entities.poNum}` });
  if (entities.jobNum) filters.push({ table: "JobHead", field: "JobNum", expression: `jh.JobNum = ${sqlString(entities.jobNum)}` });
  if (entities.orderNum !== undefined) filters.push({ table: "OrderHed", field: "OrderNum", expression: `oh.OrderNum = ${entities.orderNum}` });
  if (entities.vendorNum !== undefined) filters.push({ table: "POHeader", field: "VendorNum", expression: `poh.VendorNum = ${entities.vendorNum}` });
  if (entities.customerNum !== undefined) filters.push({ table: "OrderHed", field: "CustNum", expression: `oh.CustNum = ${entities.customerNum}` });

  const dateField = intentDateField(intent);
  if (dateField && intent.dateRange?.relativeDays) {
    filters.push({ expression: `${dateField} >= DATEADD(day, -${intent.dateRange.relativeDays}, CAST(GETDATE() AS date))` });
  }
  if (dateField && isIsoDate(intent.dateRange?.from)) filters.push({ expression: `${dateField} >= ${sqlString(intent.dateRange.from)}` });
  if (dateField && isIsoDate(intent.dateRange?.to)) filters.push({ expression: `${dateField} <= ${sqlString(intent.dateRange.to)}` });

  return filters;
}

function partAlias(moduleName: ErpSqlIntent["module"], question: string): string {
  if (moduleName === "purchase") return "pod";
  if (moduleName === "sales") return "od";
  if (moduleName === "inventory" && /(交易|tran|transaction)/i.test(question)) return "pt";
  return "pw";
}

function intentDateField(intent: ErpSqlIntent): string {
  if (!intent.dateRange) return "";
  if (intent.module === "purchase") return "por.DueDate";
  if (intent.module === "inventory") return "pt.TranDate";
  if (intent.module === "sales") return "orh.ReqDate";
  return "";
}

function buildIntentWarnings(intent: ErpSqlIntent | undefined): string[] {
  if (!intent) return [];
  const warnings: string[] = [];
  if (intent.entities.vendorName) warnings.push("Intent vendorName was extracted but not used as a SQL filter; vendor name matching needs a selected Vendor table.");
  if (intent.entities.customerName) warnings.push("Intent customerName was extracted but not used as a SQL filter; customer name matching needs a selected Customer table.");
  if (intent.metrics?.length || intent.groupBy?.length || intent.orderBy?.length) {
    warnings.push("Intent metrics/groupBy/orderBy were extracted but not directly used as SQL expressions.");
  }
  return warnings;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (!limit) return fallback;
  return Math.max(1, Math.min(limit, 500));
}

function isDateSensitiveQuestion(question: string): boolean {
  return /(最新|最近|本月|今年|去年|今日|今天|昨日|昨天|近\d+|\d{4}年\d{1,2}月|\d{1,2}月份?|last|latest|recent|month|year|today|yesterday)/i.test(question);
}

function pickScenario(
  question: string,
  intent: QueryIntent,
  tables: QueryPlanSchemaTable[],
  dateSensitive: boolean,
): QueryPlanScenario {
  const tableNames = new Set(tables.map((table) => table.tableName));
  if (tableNames.has("POHeader") && tableNames.has("PODetail") && /(采购额|采购金额|采购.*比例|采购.*占比|钢材|材料.*采购|purchase.*amount|spend)/i.test(question)) return "purchaseSpendByType";
  if (tableNames.has("POHeader") && tableNames.has("PODetail") && tableNames.has("PORel") && (question.includes("延期") || intent === "aggregate")) return "purchaseDelayVendor";
  if (tableNames.has("POHeader") && tableNames.has("PODetail")) return "purchaseDetail";
  if (tableNames.has("JobHead")) return "openJob";
  if (tableNames.has("PartTran") && dateSensitive) return "recentInventoryTran";
  if (tableNames.has("PartWhse") || tableNames.has("PartBin")) return "inventoryBalance";
  if (tableNames.has("OrderHed") && tableNames.has("OrderDtl") && tableNames.has("OrderRel")) return "salesBackorder";
  return "generic";
}

function pickTables(
  tables: QueryPlanSchemaTable[],
  scenario: QueryPlanScenario,
  joinRules: JoinRule[],
): QueryPlanSchemaTable[] {
  if (scenario === "generic") return tables.slice(0, 2);
  const byName = new Map(tables.map((table) => [table.tableName, table]));
  return SCENARIO_TABLES[scenario]
    .filter((table, index, names) => scenario === "purchaseSpendByType" || byName.has(table) || canReach(joinRules, names[0], table))
    .map((tableName) => byName.get(tableName) ?? { schemaName: SCHEMA_NAME, tableName, label: null, score: 0, source: "knowledge" });
}

function canReach(rules: JoinRule[], from: string, to: string): boolean {
  return from === to || rules.some((rule) => rule.from === from && rule.to === to);
}

function buildScenarioFilters(scenario: QueryPlanScenario, dateSensitive: boolean): QueryPlanFilter[] {
  const dateField = dateFieldFor(scenario);
  if (!dateField) return [];
  if (scenario === "purchaseSpendByType") {
    return [
      { expression: `${dateField} >= DATEADD(year, -3, CAST(GETDATE() AS date))` },
      { expression: `${dateField} < DATEADD(day, 1, CAST(GETDATE() AS date))` },
    ];
  }
  const filters: QueryPlanFilter[] = [];
  if (dateSensitive || scenario === "purchaseDelayVendor" || scenario === "recentInventoryTran" || scenario === "salesBackorder") {
    filters.push({ expression: `${dateField} >= '20000101'` });
    filters.push({ expression: `${dateField} < DATEADD(year, 1, CAST(GETDATE() AS date))` });
  }
  if (scenario === "purchaseDelayVendor" || scenario === "salesBackorder") filters.push({ expression: `${dateField} < CAST(GETDATE() AS date)` });
  return filters;
}

function dateFieldFor(scenario: QueryPlanScenario): string {
  return SCENARIO_DATE_FIELDS[scenario] ?? "";
}

function selectTables(tableResults: SchemaRetrieverTableResult[], modules: ErpModuleRule[]): QueryPlanSchemaTable[] {
  const selected = new Map<string, QueryPlanSchemaTable>();
  for (const result of tableResults) {
    selected.set(schemaObjectKey(result.table.schemaName, result.table.tableName), toPlanTable(result.table, result.score, "retriever"));
  }
  for (const module of modules) {
    for (const tableName of module.coreTables) {
      const key = schemaObjectKey(SCHEMA_NAME, tableName);
      if (!selected.has(key)) {
        selected.set(key, { schemaName: SCHEMA_NAME, tableName, label: null, score: 0, source: "knowledge" });
      }
    }
  }
  return [...selected.values()].slice(0, MAX_TABLES);
}

function isDefaultStatusFilter(rule: StatusRule): boolean {
  return rule.behavior === "excludeByDefault" && Boolean(rule.defaultPredicate);
}

function toRecommendedStatusFilter(
  rule: StatusRule,
): Pick<StatusRule, "module" | "table" | "field" | "behavior" | "defaultPredicate"> {
  return {
    module: rule.module,
    table: rule.table,
    field: rule.field,
    behavior: rule.behavior,
    defaultPredicate: rule.defaultPredicate,
  };
}

function buildWarnings(
  question: string,
  modules: QueryPlanModule[],
  schemaTableCount: number,
  dateSensitive: boolean,
  moduleDateRuleCount: number,
): string[] {
  const warnings: string[] = [];
  if (!question) warnings.push("Question is empty; planner returned only default safety guidance.");
  if (modules.length === 0) warnings.push("No ERP module matched the question from KnowledgeRepository.");
  if (schemaTableCount === 0) warnings.push("SchemaRetrieverService returned no table candidates.");
  if (dateSensitive && moduleDateRuleCount === 0) warnings.push("Question appears date-sensitive, but no module date rule matched.");
  return warnings;
}

function calculateConfidence(modules: QueryPlanModule[], schemaScore: number): number {
  const moduleScore = modules[0]?.score ?? 0;
  const raw = moduleScore / 25 + schemaScore / 300;
  return Math.max(0, Math.min(1, Number(raw.toFixed(2))));
}

export const sqlPlannerService = new SqlPlannerService();
