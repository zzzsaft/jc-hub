import assert from "node:assert/strict";
import { KnowledgeRepository } from "../../src/features/erpSqlAgent/knowledge/index.js";
import type { ErpModuleName, ErpModuleRule } from "../../src/features/erpSqlAgent/knowledge/types/ErpKnowledge.types.js";
import type { QueryPlanModule, QueryPlanSchemaField, QueryPlanSchemaTable } from "../../src/features/erpSqlAgent/planner/index.js";
import type { SqlGeneratorPlan } from "../../src/features/erpSqlAgent/generator/index.js";

const repository = new KnowledgeRepository();

export function makeGeneratorPlan(
  moduleName: ErpModuleName,
  question: string,
  intent: SqlGeneratorPlan["intent"],
  tableNames: string[],
  dateSensitive: boolean,
  scenario: SqlGeneratorPlan["scenario"] = "generic",
): SqlGeneratorPlan {
  const module = repository.getModule(moduleName);
  assert(module);
  const dateRules = repository.getDateRules();
  return {
    question,
    intent,
    scenario,
    modules: [toPlanModule(module)],
    schema: {
      result: {
        query: question,
        keywords: [question],
        tables: [],
        fields: [],
        score: 100,
      },
      selectedTables: tableNames.map(toPlanTable),
      selectedFields: tableNames.flatMap(toPlanFields),
    },
    knowledge: {
      modules: [module],
      joins: repository.getJoinRules(moduleName),
      dateRules: {
        globalSafetyRange: dateRules.globalSafetyRange,
        moduleDateFields: [repository.getDateRules(moduleName)].filter((rule): rule is NonNullable<typeof rule> => Boolean(rule)),
      },
      statusRules: repository.getStatusRules(moduleName),
      qualityRules: repository.getQualityRules(),
      companyRules: repository.getCompanyRules(),
      promptRules: repository.getPromptRules(),
    },
    constraints: {
      schemaName: "Erp",
      requireCompany: true,
      defaultLimit: 100,
      requiresDateSafetyRange: dateSensitive,
      recommendedStatusFilters: repository
        .getStatusRules(moduleName)
        .filter((rule) => rule.behavior === "excludeByDefault" && rule.defaultPredicate)
        .map((rule) => ({
          module: rule.module,
          table: rule.table,
          field: rule.field,
          behavior: rule.behavior,
          defaultPredicate: rule.defaultPredicate,
        })),
    },
    warnings: [],
    missingRequiredFields: ["Company"],
    confidence: 1,
    keywordFilters: scenarioFilters(scenario, dateSensitive),
  };
}

function scenarioFilters(scenario: SqlGeneratorPlan["scenario"], dateSensitive: boolean): SqlGeneratorPlan["keywordFilters"] {
  if (scenario === "purchaseSpendByType") {
    return [
      { expression: "poh.OrderDate >= DATEADD(year, -3, CAST(GETDATE() AS date))" },
      { expression: "poh.OrderDate < DATEADD(day, 1, CAST(GETDATE() AS date))" },
    ];
  }
  if (scenario !== "purchaseDelayVendor" || !dateSensitive) return [];
  return [
    { expression: "por.DueDate >= '20000101'" },
    { expression: "por.DueDate < DATEADD(year, 1, CAST(GETDATE() AS date))" },
    { expression: "por.DueDate < CAST(GETDATE() AS date)" },
  ];
}

function toPlanModule(rule: ErpModuleRule): QueryPlanModule {
  return {
    module: rule.module,
    label: rule.label,
    score: 10,
    reasons: [rule.label],
    rule,
  };
}

function toPlanTable(tableName: string): QueryPlanSchemaTable {
  return {
    schemaName: "Erp",
    tableName,
    label: tableName,
    score: 10,
    source: "retriever",
  };
}

function toPlanFields(tableName: string): QueryPlanSchemaField[] {
  return ["Company", keyField(tableName)].map((fieldName) => ({
    schemaName: "Erp",
    tableName,
    fieldName,
    label: fieldName,
    dataType: "nvarchar",
    source: "retriever",
  }));
}

function keyField(tableName: string): string {
  if (tableName.startsWith("PO")) return "PONum";
  if (tableName.startsWith("Job")) return "JobNum";
  if (tableName.startsWith("Part")) return "PartNum";
  if (tableName.startsWith("Order")) return "OrderNum";
  return "SysRowID";
}
