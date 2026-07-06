import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeRepository } from "../../src/features/erpSqlAgent/knowledge/index.js";
import { SqlPlannerService, type SqlPlannerSchemaRetriever } from "../../src/features/erpSqlAgent/planner/index.js";
import type { SchemaField, SchemaRetrieverResult, SchemaTable } from "../../src/features/erpSqlAgent/schema/index.js";

class FakeSchemaRetriever implements SqlPlannerSchemaRetriever {
  readonly calls: Array<{ query: string; schemaName?: string }> = [];

  constructor(private readonly result: SchemaRetrieverResult) {}

  async retrieve(query: string, options?: { schemaName?: string }): Promise<SchemaRetrieverResult> {
    this.calls.push({ query, schemaName: options?.schemaName });
    return this.result;
  }
}

const repository = new KnowledgeRepository();

test("purchase question selects purchase module and repository joins", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("采购 POHeader", ["POHeader", "PODetail"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("查询采购订单 POHeader 明细列表");

  assert.equal(retriever.calls[0]?.schemaName, "Erp");
  assert.equal(plan.modules[0]?.module, "purchase");
  assert.equal(plan.scenario, "purchaseDetail");
  assert(plan.knowledge.joins.some((rule) => rule.from === "POHeader" && rule.to === "PODetail"));
  assert(plan.schema.selectedTables.some((table) => table.tableName === "POHeader"));
});

test("production question includes repository default status rules", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("生产 JobHead", ["JobHead"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("统计生产工单数量");
  const statusFields = plan.knowledge.statusRules.map((rule) => rule.field);

  assert.equal(plan.modules[0]?.module, "production");
  assert.equal(plan.scenario, "openJob");
  assert(statusFields.includes("JobClosed"));
  assert(statusFields.includes("JobComplete"));
  assert(plan.constraints.recommendedStatusFilters.some((rule) => rule.field === "JobClosed"));
});

test("recent question includes module date rules and global safety range", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("最近采购", ["POHeader"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("最近采购订单趋势");

  assert.equal(plan.intent, "trend");
  assert.equal(plan.scenario, "purchaseDetail");
  assert.equal(plan.constraints.requiresDateSafetyRange, true);
  assert.equal(plan.knowledge.dateRules.globalSafetyRange.minExpression, "日期字段 >= '20000101'");
  assert(plan.knowledge.dateRules.moduleDateFields.some((rule) => rule.module === "purchase"));
});

test("unknown question still returns schema evidence and warning", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("nonsense", ["MysteryTable"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("完全无法归类的问题");

  assert.equal(plan.intent, "unknown");
  assert.equal(plan.scenario, "generic");
  assert.deepEqual(plan.modules, []);
  assert(plan.schema.selectedTables.some((table) => table.tableName === "MysteryTable"));
  assert(plan.warnings.some((warning) => warning.includes("No ERP module matched")));
});

test("planner returns a plan, not generated SQL", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("采购", ["POHeader"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("查询采购订单");

  assert.equal(hasKey(plan, "sql"), false);
  assert.equal(hasKey(plan, "generatedSql"), false);
  assert.equal(hasKey(plan, "validatedSql"), false);
});

test("planner uses extracted intent for module and safe filters", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("查询最近30天物料 A123 的库存交易", ["Part", "PartTran"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("查询最近30天物料 A123 的库存交易", {
    originalQuestion: "查询最近30天物料 A123 的库存交易",
    normalizedQuestion: "查询最近30天物料 A123 的库存交易",
    module: "inventory",
    intentType: "trace",
    entities: { partNum: "A123" },
    dateRange: { relativeDays: 30, label: "最近30天" },
    confidence: 0.9,
    warnings: [],
  });

  assert.equal(plan.modules[0]?.module, "inventory");
  assert.equal(plan.intent, "list");
  assert.equal(plan.scenario, "recentInventoryTran");
  assert.deepEqual(plan.schema.selectedTables.map((table) => table.tableName), ["Part", "PartTran"]);
  assert(plan.keywordFilters?.some((filter) => filter.expression === "pt.PartNum = 'A123'"));
  assert(plan.keywordFilters?.some((filter) => filter.expression.includes("DATEADD(day, -30")));
});

test("planner owns scenario-specific final tables and filters", async () => {
  const retriever = new FakeSchemaRetriever(makeSchemaResult("查看采购额比例", ["POHeader", "PODetail"]));
  const planner = new SqlPlannerService(retriever, repository);

  const plan = await planner.plan("查看公司近三年的采购额和采购类型比例，钢材占采购额多少");

  assert.equal(plan.scenario, "purchaseSpendByType");
  assert.deepEqual(plan.schema.selectedTables.map((table) => table.tableName), ["POHeader", "PODetail", "Part", "PartClass"]);
  assert(plan.keywordFilters?.some((filter) => filter.expression === "poh.OrderDate >= DATEADD(year, -3, CAST(GETDATE() AS date))"));
});

function makeSchemaResult(query: string, tableNames: string[]): SchemaRetrieverResult {
  const tables = tableNames.map((tableName, index) => ({
    table: makeTable(tableName),
    fields: [makeField(tableName, "Company"), makeField(tableName, `${tableName}Num`)],
    score: 100 - index,
  }));

  return {
    query,
    keywords: query.split(/\s+/).filter(Boolean),
    tables,
    fields: tables.flatMap((table) => table.fields),
    score: 120,
  };
}

function makeTable(tableName: string): SchemaTable {
  return {
    id: 1n,
    schemaName: "Erp",
    tableName,
    description: null,
    tableLabel: tableName,
    systemCode: null,
    tableType: null,
    dataTableId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makeField(tableName: string, fieldName: string): SchemaField {
  return {
    id: 1n,
    schemaName: "Erp",
    tableName,
    fieldName,
    dbFieldName: fieldName,
    fieldLabel: fieldName,
    description: null,
    dataType: "nvarchar",
    required: false,
    readOnly: false,
    useDbDefault: false,
    tooltipText: null,
    isDescriptionField: false,
    likeDataFieldName: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function hasKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((child) => hasKey(child, key));
}
