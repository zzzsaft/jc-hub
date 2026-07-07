import { sqlGuardService } from "../../sqlGuard/index.js";
import type {
  SqlGenerationResult,
  SqlGeneratorGuard,
  SqlGeneratorPlan,
  SqlPlanFilter,
  SqlPlanMetric,
  SqlPlanOrderBy,
} from "../types/SqlGeneratorTypes.js";

type Scenario = SqlGeneratorPlan["scenario"];
type SelectItem = { expression: string; alias: string };

const KEY_ALIASES = new Set(["Company", "PartNum", "JobNum", "OrderNum", "PONum", "InvoiceNum", "PackNum"]);
const ALIASES = new Map([
  ["POHeader", "poh"],
  ["PODetail", "pod"],
  ["PORel", "por"],
  ["Vendor", "v"],
  ["PartClass", "pc"],
  ["JobHead", "jh"],
  ["JobOper", "jo"],
  ["Part", "p"],
  ["PartWhse", "pw"],
  ["PartBin", "pb"],
  ["PartTran", "pt"],
  ["OrderHed", "oh"],
  ["OrderDtl", "od"],
  ["OrderRel", "orh"],
  ["Customer", "c"],
]);

export class SqlGeneratorService {
  constructor(private readonly guard: SqlGeneratorGuard = sqlGuardService) {}

  async generate(plan: SqlGeneratorPlan): Promise<SqlGenerationResult> {
    const scenario = plan.scenario;
    const tableNames = plan.schema.selectedTables.map((table) => table.tableName);
    const aliasByTable = buildAliases(tableNames);
    const selectItems = buildSelectItems(plan, scenario, aliasByTable);
    const joins = buildJoins(plan, tableNames, aliasByTable);
    const filters = buildFilters(plan, aliasByTable);
    const groupBy = plan.groupBy ?? defaultGroupBy(scenario, aliasByTable);
    const orderBy = plan.orderBy ?? defaultOrderBy(scenario);
    const aggregate = plan.intent === "aggregate" || plan.metrics !== undefined || groupBy.length > 0;
    const top = !aggregate || hasRankingIntent(plan, scenario, orderBy) ? ` TOP ${plan.constraints.defaultLimit}` : "";
    const sql = formatSql({
      top,
      selectItems,
      from: `${schemaName(plan)}.${tableNames[0]} ${aliasByTable.get(tableNames[0]) ?? "t1"}`,
      joins,
      filters,
      groupBy,
      orderBy,
    });
    const guardResult = await this.guard.validate(sql, guardOptions(plan));

    return {
      valid: guardResult.valid,
      source: "rule",
      scenario,
      sql,
      intent: plan.intent,
      tables: tableNames.map((table) => `${schemaName(plan)}.${table}`),
      joins,
      filters,
      assumptions: buildAssumptions(plan, scenario),
      warnings: [...plan.warnings, ...guardResult.warnings],
      guardResult,
    };
  }
}

function buildAliases(tables: string[]): Map<string, string> {
  const used = new Set<string>();
  return new Map(tables.map((table, index) => {
    const preferred = ALIASES.get(table) ?? `t${index + 1}`;
    const alias = used.has(preferred) ? `t${index + 1}` : preferred;
    used.add(alias);
    return [table, alias];
  }));
}

function buildSelectItems(plan: SqlGeneratorPlan, scenario: Scenario, aliases: Map<string, string>): SelectItem[] {
  if (scenario === "purchaseSpendByType") {
    const amount = `${aliases.get("PODetail") ?? "pod"}.DocExtCost`;
    const type = `COALESCE(${aliases.get("PartClass") ?? "pc"}.Description, ${aliases.get("Part") ?? "p"}.ClassID, N'未分类')`;
    return [
      { expression: `${aliases.get("POHeader") ?? "poh"}.Company`, alias: "Company" },
      { expression: `YEAR(${aliases.get("POHeader") ?? "poh"}.OrderDate)`, alias: "采购年份" },
      { expression: type, alias: "采购类型" },
      { expression: `SUM(${amount})`, alias: "采购额" },
      { expression: `CAST(SUM(${amount}) * 100.0 / NULLIF(SUM(SUM(${amount})) OVER (PARTITION BY ${aliases.get("POHeader") ?? "poh"}.Company, YEAR(${aliases.get("POHeader") ?? "poh"}.OrderDate)), 0) AS decimal(18, 2))`, alias: "采购额占比" },
    ];
  }

  if (plan.metrics || plan.groupBy) {
    return [
      companySelect(aliases),
      ...((plan.groupBy ?? []).filter((item) => !item.endsWith(".Company")).map((expression) => ({ expression, alias: fieldAlias(expression) }))),
      ...((plan.metrics ?? []).map(metricSelect)),
    ];
  }

  const a = (table: string) => aliases.get(table) ?? "t1";
  const defaults: Record<Scenario, SelectItem[]> = {
    purchaseSpendByType: [],
    purchaseDelayVendor: [
      { expression: `${a("POHeader")}.Company`, alias: "Company" },
      { expression: `${a("POHeader")}.VendorNum`, alias: "供应商编号" },
      { expression: `${a("Vendor")}.Name`, alias: "供应商名称" },
      { expression: "COUNT(*)", alias: "延期次数" },
      { expression: `AVG(DATEDIFF(day, ${a("PORel")}.DueDate, CAST(GETDATE() AS date)))`, alias: "平均延期天数" },
    ],
    purchaseDetail: [
      { expression: `${a("POHeader")}.Company`, alias: "Company" },
      { expression: `${a("POHeader")}.PONum`, alias: "PONum" },
      { expression: `${a("PODetail")}.POLine`, alias: "采购行" },
      { expression: `${a("PODetail")}.PartNum`, alias: "PartNum" },
      { expression: `${a("PODetail")}.LineDesc`, alias: "物料描述" },
    ],
    openJob: [
      { expression: `${a("JobHead")}.Company`, alias: "Company" },
      { expression: `${a("JobHead")}.JobNum`, alias: "JobNum" },
      { expression: `${a("JobHead")}.PartNum`, alias: "PartNum" },
      { expression: `${a("JobHead")}.ProdQty`, alias: "生产数量" },
    ],
    inventoryBalance: [
      { expression: `${a("PartWhse")}.Company`, alias: "Company" },
      { expression: `${a("PartWhse")}.PartNum`, alias: "PartNum" },
      { expression: `${a("PartWhse")}.WarehouseCode`, alias: "仓库" },
      { expression: `${a("PartWhse")}.OnHandQty`, alias: "库存数量" },
    ],
    recentInventoryTran: [
      { expression: `${a("PartTran")}.Company`, alias: "Company" },
      { expression: `${a("PartTran")}.PartNum`, alias: "PartNum" },
      { expression: `${a("PartTran")}.TranDate`, alias: "交易日期" },
      { expression: `${a("PartTran")}.TranType`, alias: "交易类型" },
      { expression: `${a("PartTran")}.TranQty`, alias: "交易数量" },
    ],
    salesBackorder: [
      { expression: `${a("OrderHed")}.Company`, alias: "Company" },
      { expression: `${a("OrderHed")}.OrderNum`, alias: "OrderNum" },
      { expression: `${a("OrderDtl")}.OrderLine`, alias: "销售行" },
      { expression: `${a("OrderDtl")}.PartNum`, alias: "PartNum" },
      { expression: `${a("OrderRel")}.ReqDate`, alias: "需求日期" },
    ],
    generic: [
      companySelect(aliases),
      { expression: `${[...aliases.values()][0] ?? "t1"}.*`, alias: "*" },
    ],
  };
  return defaults[scenario];
}

function buildJoins(plan: SqlGeneratorPlan, tables: string[], aliases: Map<string, string>): string[] {
  if (tables.includes("POHeader") && tables.includes("PODetail") && tables.includes("Part")) {
    return [
      `INNER JOIN Erp.PODetail ${aliases.get("PODetail") ?? "pod"}\n  ON ${aliases.get("POHeader") ?? "poh"}.Company = ${aliases.get("PODetail") ?? "pod"}.Company\n  AND ${aliases.get("POHeader") ?? "poh"}.PONum = ${aliases.get("PODetail") ?? "pod"}.PONum`,
      `LEFT JOIN Erp.Part ${aliases.get("Part") ?? "p"}\n  ON ${aliases.get("PODetail") ?? "pod"}.Company = ${aliases.get("Part") ?? "p"}.Company\n  AND ${aliases.get("PODetail") ?? "pod"}.PartNum = ${aliases.get("Part") ?? "p"}.PartNum`,
      `LEFT JOIN Erp.PartClass ${aliases.get("PartClass") ?? "pc"}\n  ON ${aliases.get("Part") ?? "p"}.Company = ${aliases.get("PartClass") ?? "pc"}.Company\n  AND ${aliases.get("Part") ?? "p"}.ClassID = ${aliases.get("PartClass") ?? "pc"}.ClassID`,
    ];
  }

  const joins: string[] = [];
  const joined = new Set([tables[0]]);
  for (const table of tables.slice(1)) {
    const rule = plan.knowledge.joins.find((item) => joined.has(item.from) && item.to === table) ?? plan.knowledge.joins.find((item) => item.from === table && joined.has(item.to));
    if (!rule) continue;
    const left = joined.has(rule.from) ? rule.from : rule.to;
    const right = left === rule.from ? rule.to : rule.from;
    const leftAlias = aliases.get(left) ?? "t1";
    const rightAlias = aliases.get(right) ?? "t2";
    const keys = rule.on.includes("Company") ? rule.on : ["Company", ...rule.on];
    joins.push(`${rule.joinType} JOIN Erp.${right} ${rightAlias}\n  ON ${keys.map((key, index) => `${index === 0 ? "" : " AND "}${leftAlias}.${key} = ${rightAlias}.${key}`).join("\n ")}`);
    joined.add(right);
  }
  return joins;
}

function buildFilters(plan: SqlGeneratorPlan, aliases: Map<string, string>): string[] {
  const filters = [...filterExpressions(plan.statusFilters), ...filterExpressions(plan.keywordFilters)]
    .filter((filter) => referencesOnlyKnownAliases(filter, aliases));
  filters.push(
    ...plan.constraints.recommendedStatusFilters
      .filter((filter) => filter.table !== "*" && !filter.field.includes("*"))
      .map((filter) => qualifyPredicate(filter.defaultPredicate ?? "", filter.table, aliases))
      .filter(Boolean),
  );

  return unique(filters);
}

function filterExpressions(filters: SqlPlanFilter[] | undefined): string[] {
  return (filters ?? []).map((filter) => filter.expression).filter(Boolean);
}

function referencesOnlyKnownAliases(expression: string, aliases: Map<string, string>): boolean {
  const knownAliases = new Set(aliases.values());
  const referencedAliases = [...expression.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\./g)].map((match) => match[1]);
  return referencedAliases.every((alias) => alias && knownAliases.has(alias));
}

function qualifyPredicate(predicate: string, table: string, aliases: Map<string, string>): string {
  const alias = aliases.get(table);
  if (!predicate || !alias || table === "*") return predicate;
  return predicate.replace(/\b([A-Za-z][A-Za-z0-9_]*)\b/g, (match) => KEYWORDS.has(match.toUpperCase()) || /^\d+$/.test(match) ? match : `${alias}.${match}`);
}

const KEYWORDS = new Set(["AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE"]);

function defaultGroupBy(scenario: Scenario, aliases: Map<string, string>): string[] {
  if (scenario === "purchaseSpendByType") {
    return [
      `${aliases.get("POHeader") ?? "poh"}.Company`,
      `YEAR(${aliases.get("POHeader") ?? "poh"}.OrderDate)`,
      `COALESCE(${aliases.get("PartClass") ?? "pc"}.Description, ${aliases.get("Part") ?? "p"}.ClassID, N'未分类')`,
    ];
  }
  if (scenario !== "purchaseDelayVendor") return [];
  return [`${aliases.get("POHeader") ?? "poh"}.Company`, `${aliases.get("POHeader") ?? "poh"}.VendorNum`, `${aliases.get("Vendor") ?? "v"}.Name`];
}

function defaultOrderBy(scenario: Scenario): SqlPlanOrderBy[] {
  if (scenario === "purchaseSpendByType") return [{ expression: "[采购年份]", direction: "DESC" }, { expression: "[采购额]", direction: "DESC" }];
  if (scenario === "purchaseDelayVendor") return [{ expression: "[延期次数]", direction: "DESC" }];
  return [];
}

function formatSql(input: {
  top: string;
  selectItems: SelectItem[];
  from: string;
  joins: string[];
  filters: string[];
  groupBy: string[];
  orderBy: SqlPlanOrderBy[];
}): string {
  const lines = [
    `SELECT${input.top}`,
    input.selectItems.map((item, index) => `  ${index === 0 ? "" : ""}${item.expression} AS ${formatAlias(item.alias)}`).join(",\n"),
    `FROM ${input.from}`,
    ...input.joins,
  ];
  if (input.filters.length > 0) lines.push("WHERE " + input.filters.map((filter, index) => `${index === 0 ? "" : "  AND "}${filter}`).join("\n"));
  if (input.groupBy.length > 0) lines.push("GROUP BY\n" + input.groupBy.map((item, index) => `  ${index === 0 ? "" : ""}${item}`).join(",\n"));
  if (input.orderBy.length > 0) lines.push("ORDER BY\n" + input.orderBy.map((item) => `  ${item.expression}${item.direction ? ` ${item.direction}` : ""}`).join(",\n"));
  return `${lines.join("\n")};`;
}

function formatAlias(alias: string): string {
  if (alias === "*" || KEY_ALIASES.has(alias)) return alias;
  return `[${alias}]`;
}

function metricSelect(metric: SqlPlanMetric): SelectItem {
  return { expression: metric.expression, alias: metric.alias };
}

function companySelect(aliases: Map<string, string>): SelectItem {
  return { expression: `${[...aliases.values()][0] ?? "t1"}.Company`, alias: "Company" };
}

function fieldAlias(expression: string): string {
  const field = expression.split(".").at(-1) ?? expression;
  return KEY_ALIASES.has(field) ? field : field;
}

function hasRankingIntent(plan: SqlGeneratorPlan, scenario: Scenario, orderBy: SqlPlanOrderBy[]): boolean {
  return scenario === "purchaseDelayVendor" || orderBy.length > 0 || plan.orderBy !== undefined || /(top|排名|最高|最多|最低|最少)/i.test(plan.question);
}

function schemaName(plan: SqlGeneratorPlan): string {
  return plan.constraints.schemaName;
}

function buildAssumptions(plan: SqlGeneratorPlan, scenario: Scenario): string[] {
  const assumptions = [`Generated rule-based SQL for ${scenario}.`];
  if (scenario === "purchaseSpendByType") assumptions.push("采购额按采购订单行 PODetail.DocExtCost 统计，类型按 PartClass/Part.ClassID 归类；不是收货额或应付发票额。");
  if (!plan.metrics) assumptions.push("No explicit plan.metrics supplied; generator used scenario defaults.");
  return assumptions;
}

function guardOptions(plan: SqlGeneratorPlan) {
  return {
    module: plan.extractedIntent?.module ?? plan.modules[0]?.module,
    references: plan.references,
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export const ruleSqlGeneratorService = new SqlGeneratorService();
