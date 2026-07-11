import type { SqlGenerationResult, SqlGeneratorGuard, SqlReferenceHint } from "../../generator/index.js";
import { sqlGuardService, type FinanceSqlMode } from "../../sqlGuard/index.js";
import type { ApprovedMetricCandidate } from "../../templates/repository/SqlTemplateRepository.js";
import type { AnalysisPlan, AnalysisPlanTimeRange } from "../types/SqlPlannerTypes.js";
import { applyErpSqlAccessScope, assertModuleAllowed, type ErpSqlAccessScope } from "../../access/index.js";

type AtomicMetricDefinition = {
  kind?: string;
  metricCode?: string;
  grain?: string | string[];
  dimensions?: string[];
  dimensionExpressions?: Record<string, string>;
  keyExpressions?: Record<string, string>;
  timeField?: string;
  amountExpression?: string;
  valueExpression?: string;
  rateExpression?: string;
  aggregation?: string;
  statusFilters?: string[];
  overdueFilters?: string[];
  requiredTables?: string[];
  joinSql?: string[];
  dimensionJoinSql?: Record<string, string[]>;
  joinKeys?: string[];
  mode?: "strict" | "decision_support";
  taxRefundPolicy?: string;
};

export type MetricComposerResult =
  | { ok: true; generation: SqlGenerationResult; references: SqlReferenceHint[] }
  | { ok: false; error: string; clarificationQuestions?: string[]; missingApprovedMetrics?: string[] };

export class MetricComposerService {
  constructor(private readonly guard: SqlGeneratorGuard = sqlGuardService) {}

  async compose(input: {
    question: string;
    analysisPlan: AnalysisPlan;
    metrics: ApprovedMetricCandidate[];
    financeMode?: FinanceSqlMode;
    accessScope?: ErpSqlAccessScope;
    signal?: AbortSignal;
    module?: string;
  }): Promise<MetricComposerResult> {
    const composeStartedAt = Date.now();
    const byCode = new Map(input.metrics.map((metric) => [metric.metricCode, metric]));
    const requiredMetrics = input.analysisPlan.requiredMetrics ?? input.analysisPlan.metrics;
    const missing = requiredMetrics.filter((code) => !byCode.has(code));
    if (missing.length > 0) {
      return { ok: false, error: `缺少 approved atomic metric: ${missing.join(", ")}`, missingApprovedMetrics: missing };
    }

    const metrics = input.analysisPlan.metrics.filter((code) => byCode.has(code)).map((code) => byCode.get(code)!);
    const definitions = metrics.map((metric) => readDefinition(metric));
    const nonAtomic = metrics.filter((metric, index) => definitions[index]?.kind !== "atomic_metric").map((metric) => metric.metricCode);
    if (nonAtomic.length > 0) return { ok: false, error: `缺少 approved atomic metric: ${nonAtomic.join(", ")}` };

    const joinKeys = sharedJoinKey(definitions);
    if (!joinKeys && new Set(definitions.map((definition) => grainKey(definition))).size > 1) {
      return { ok: false, error: "approved atomic metrics grain/joinKeys 不兼容，拼接口径置信度不足，仅供参考。" };
    }

    const missingDimensions = input.analysisPlan.dimensions.filter((dimension) =>
      definitions.some((definition) => !definition.dimensions?.includes(dimension) || !definition.dimensionExpressions?.[dimension])
    );
    if (missingDimensions.length > 0) {
      return { ok: false, error: `approved atomic metric 缺少维度表达式: ${[...new Set(missingDimensions)].join(", ")}` };
    }
    if (input.analysisPlan.timeGrain && definitions.some((definition) => !definition.timeField)) {
      return { ok: false, error: `approved atomic metric 缺少时间字段，按 ${input.analysisPlan.timeGrain} 聚合的置信度不足，仅供参考。` };
    }
    if (input.analysisPlan.comparison && (!input.analysisPlan.timeRange || !timeWindow(input.analysisPlan.timeRange))) {
      return { ok: false, error: "比较周期缺少可编译的主时间范围。" };
    }
    if (input.analysisPlan.customerName && input.analysisPlan.dimensions.includes("customer")) {
      const unsafeCustomerMetrics = definitions
        .map((definition, index) => ({ metricCode: metrics[index]!.metricCode, expression: definition.dimensionExpressions?.customer ?? "" }))
        .filter((item) => !isSafeCustomerExpression(item.expression));
      if (unsafeCustomerMetrics.length > 0) {
        return {
          ok: false,
          error: `approved atomic metric 客户维度不能按客户名过滤: ${unsafeCustomerMetrics.map((item) => item.metricCode).join(", ")}`,
        };
      }
    }

    const keyFields = splitJoinKey(joinKeys ?? "Company");
    const validationCtes = buildDimensionRuleValidationCtes(input.analysisPlan);
    const ctes = definitions.map((definition, index) => buildMetricCte(metrics[index], definition, input.analysisPlan, keyFields));
    const unsupported = ctes.find((cte) => cte.error);
    if (unsupported?.error) return { ok: false, error: unsupported.error };

    const aliases = metrics.map((metric) => safeName(metric.metricCode));
    const composedSql = [
      `WITH ${[...validationCtes, ...ctes.map((cte) => cte.sql)].join(",\n")}`,
      buildOuterSelect(input.analysisPlan, metrics, definitions, aliases, keyFields),
    ].join("\n");
    if (input.accessScope) assertModuleAllowed(input.accessScope, [input.module ?? (input.financeMode ? "finance" : "custom")]);
    const sql = input.accessScope ? applyErpSqlAccessScope(composedSql, input.accessScope) : composedSql;
    const references = metrics.map(mapMetricReference);
    const guardStartedAt = Date.now();
    const guardResult = await this.guard.validate(sql, {
      module: input.financeMode ? "finance" : undefined,
      financeMode: input.financeMode,
      references,
      signal: input.signal,
    });
    const guardFinishedAt = Date.now();

    return {
      ok: true,
      references,
      generation: {
        valid: guardResult.valid,
        source: "rule",
        scenario: "atomicMetricComposer",
        sql,
        intent: "aggregate",
        tables: [...new Set(metrics.flatMap((metric) => metric.coreTables))],
        joins: metrics.flatMap((metric) => metric.joins),
        filters: definitions.flatMap((definition) => definition.statusFilters ?? []),
        assumptions: [
          "SQL composed from approved atomic metric definitions only.",
          ...(input.analysisPlan.scenario ? [`scenario recipe: ${input.analysisPlan.scenario}`] : []),
          ...(input.analysisPlan.assumptions ?? []),
        ],
        warnings: [
          ...guardResult.warnings,
          ...(input.analysisPlan.requiredMetrics ? [`required approved metrics: ${input.analysisPlan.requiredMetrics.join(", ")}`] : []),
        ],
        guardResult,
        references,
        composerTimings: [
          { stage: "precheck_and_sql", durationMs: guardStartedAt - composeStartedAt },
          { stage: "schema_guard", durationMs: guardFinishedAt - guardStartedAt },
        ],
      },
    };
  }
}

function buildMetricCte(
  metric: ApprovedMetricCandidate,
  definition: AtomicMetricDefinition,
  plan: AnalysisPlan,
  keyFields: string[],
): { sql: string; error?: string } {
  const table = (definition.requiredTables?.[0] ?? metric.coreTables[0])?.replace(/^Erp\./iu, "");
  const expression = definition.amountExpression ?? definition.valueExpression ?? definition.rateExpression;
  if (!table || !expression) return { sql: "", error: `${metric.metricCode} definition_json 缺少 requiredTables 或 amountExpression。` };
  const alias = table.replace(/\W+/gu, "");
  const joins = [
    ...(definition.joinSql ?? []),
    ...plan.dimensions.flatMap((dimension) => definition.dimensionJoinSql?.[dimension] ?? []),
    ...dimensionRuleValidationJoins(plan, definition),
  ];
  const keySelects = keyFields.map((key) => `${definition.keyExpressions?.[key] ?? `${alias}.${key}`} AS ${key}`);
  const periodExpression = periodExpressionFor(plan, definition);
  const dimensionSelects = plan.dimensions
    .map((dimension) => dimensionExpressionFor(definition, plan, dimension) ? `${dimensionExpressionFor(definition, plan, dimension)} AS [${dimension}]` : "")
    .filter(Boolean);
  const timeSelect = definition.timeField ? [`MIN(${definition.timeField}) AS [__timeField]`] : [];
  const metricExpression = aggregateExpression(expression, definition.aggregation);
  const where = filtersFor(definition, plan, metric.metricCode).join("\n  AND ");
  const groupBy = [
    ...keyFields.map((key) => definition.keyExpressions?.[key] ?? `${alias}.${key}`),
    periodExpression,
    ...plan.dimensions.map((dimension) => dimensionExpressionFor(definition, plan, dimension)).filter(Boolean),
  ].filter(Boolean);

  return {
    sql: [
      `${safeName(metric.metricCode)} AS (`,
      "  SELECT",
      [...keySelects, ...(periodExpression ? [`${periodExpression} AS [period]`] : []), ...dimensionSelects, ...timeSelect, `${metricExpression} AS [${metric.metricCode}]`].map((item) => `    ${item}`).join(",\n"),
      `  FROM Erp.${table} ${alias}`,
      ...joins.map((join) => `  ${join}`),
      ...(where ? [`  WHERE ${where}`] : []),
      ...(groupBy.length > 0 ? [`  GROUP BY ${groupBy.join(", ")}`] : []),
      ")",
    ].join("\n"),
  };
}

function buildOuterSelect(
  plan: AnalysisPlan,
  metrics: ApprovedMetricCandidate[],
  definitions: AtomicMetricDefinition[],
  aliases: string[],
  keyFields: string[],
): string {
  if (plan.comparison) return buildComparisonSelect(plan, metrics, definitions, aliases, keyFields);
  const first = aliases[0];
  const orderAmountIndex = metrics.findIndex((metric) => metric.metricCode === "order_amount");
  const orderAmountAlias = orderAmountIndex >= 0 ? aliases[orderAmountIndex] : "";
  const hasConcentrationColumns = Boolean(plan.analysisShape === "concentration"
    && orderAmountAlias
    && plan.dimensions.includes("product")
    && plan.dimensions.includes("customer"));
  const selectItems = [
    ...keyFields.map((key) => `${first}.${key} AS ${key}`),
    ...(plan.timeGrain ? [`${first}.[period] AS [period]`] : []),
    ...plan.dimensions.map((dimension) => `${first}.[${dimension}] AS [${dimension}]`),
    ...metrics.map((metric, index) => `${aliases[index]}.[${metric.metricCode}] AS [${metric.metricCode}]`),
    ...(hasConcentrationColumns ? [
      `CAST(${orderAmountAlias}.[order_amount] AS decimal(38,10)) / NULLIF(SUM(${orderAmountAlias}.[order_amount]) OVER (PARTITION BY ${first}.[product]), 0) AS [customer_share_rate]`,
      `COUNT(${first}.[customer]) OVER (PARTITION BY ${first}.[product]) AS [customer_count]`,
    ] : []),
    ...dimensionRuleScopeColumns(plan),
    `N'${escapeSqlLiteral(definitions.map((definition) => definition.timeField).filter(Boolean).join("; ") || "未定义")}' AS [时间字段]`,
    `N'${escapeSqlLiteral(metrics.map((metric) => metric.metricCode).join("; "))}' AS [金额字段]`,
    `N'${escapeSqlLiteral(definitions.flatMap((definition) => definition.statusFilters ?? []).join("; ") || "未定义")}' AS [状态过滤]`,
    `N'${escapeSqlLiteral(definitions.map((definition) => definition.taxRefundPolicy ?? "按 approved atomic metric definition_json").join("; "))}' AS [税退款口径]`,
  ];
  const joins = aliases.slice(1).map((alias) =>
    `JOIN ${alias} ON ${[
      ...keyFields.map((key) => `${first}.${key} = ${alias}.${key}`),
      ...(plan.timeGrain ? [`${first}.[period] = ${alias}.[period]`] : []),
      ...plan.dimensions.map((dimension) => `${first}.[${dimension}] = ${alias}.[${dimension}]`),
    ].join(" AND ")}`
  );
  const orderBy = plan.orderBy[0] && metrics.some((metric) => metric.metricCode === plan.orderBy[0]?.metric)
    ? `\nORDER BY [${plan.orderBy[0].metric}] ${plan.orderBy[0].direction}`
    : "";
  const limit = Math.min(Math.max(plan.limit ?? 100, 1), 1000);
  return [
    `SELECT TOP ${limit}`,
    selectItems.map((item) => `  ${item}`).join(",\n"),
    `FROM ${first}`,
    ...joins,
  ].join("\n") + orderBy + ";";
}

function buildComparisonSelect(
  plan: AnalysisPlan,
  metrics: ApprovedMetricCandidate[],
  definitions: AtomicMetricDefinition[],
  aliases: string[],
  keyFields: string[],
): string {
  const periods = comparisonPeriods(plan);
  if (!periods) return "SELECT TOP 0 1 AS [unsupported_comparison];";
  const currentAliases = aliases.map((alias) => `${alias}_current`);
  const previousAliases = aliases.map((alias) => `${alias}_comparison`);
  const first = currentAliases[0];
  const joinKeys = (left: string, right: string) => [
    ...keyFields.map((key) => `${left}.${key} = ${right}.${key}`),
    ...plan.dimensions.map((dimension) => `${left}.[${dimension}] = ${right}.[${dimension}]`),
  ].join(" AND ");
  const selectItems = [
    ...keyFields.map((key) => `${first}.${key} AS ${key}`),
    ...plan.dimensions.map((dimension) => `${first}.[${dimension}] AS [${dimension}]`),
    ...metrics.flatMap((metric, index) => {
      const current = `${currentAliases[index]}.[${metric.metricCode}]`;
      const previous = `${previousAliases[index]}.[${metric.metricCode}]`;
      return [
        `${current} AS [${metric.metricCode}]`,
        `${previous} AS [${metric.metricCode}_comparison]`,
        `${current} - ${previous} AS [${metric.metricCode}_change]`,
        `CAST(${current} - ${previous} AS decimal(38,10)) / NULLIF(${previous}, 0) AS [${metric.metricCode}_change_rate]`,
      ];
    }),
    ...dimensionRuleScopeColumns(plan),
    `N'${escapeSqlLiteral(definitions.map((definition) => definition.timeField).filter(Boolean).join("; ") || "未定义")}' AS [时间字段]`,
    `N'${escapeSqlLiteral(metrics.map((metric) => metric.metricCode).join("; "))}' AS [金额字段]`,
    `N'${escapeSqlLiteral(definitions.flatMap((definition) => definition.statusFilters ?? []).join("; ") || "未定义")}' AS [状态过滤]`,
    `N'${escapeSqlLiteral(definitions.map((definition) => definition.taxRefundPolicy ?? "按 approved atomic metric definition_json").join("; "))}' AS [税退款口径]`,
  ];
  const joins = metrics.flatMap((_metric, index) => {
    const current = currentAliases[index];
    const previous = previousAliases[index];
    if (index === 0) {
      return [`LEFT JOIN ${aliases[index]} ${previous} ON ${joinKeys(current, previous)} AND ${previous}.[period] = ${periods.previousKey}`];
    }
    return [
      `JOIN ${aliases[index]} ${current} ON ${joinKeys(first, current)} AND ${current}.[period] = ${periods.currentKey}`,
      `LEFT JOIN ${aliases[index]} ${previous} ON ${joinKeys(current, previous)} AND ${previous}.[period] = ${periods.previousKey}`,
    ];
  });
  const order = plan.orderBy[0] && metrics.some((metric) => metric.metricCode === plan.orderBy[0]?.metric)
    ? `ORDER BY [${plan.orderBy[0].metric}] ${plan.orderBy[0].direction}`
    : "";
  const limit = Math.min(Math.max(plan.limit ?? 100, 1), 1000);
  return [
    `SELECT TOP ${limit}`,
    selectItems.map((item) => `  ${item}`).join(",\n"),
    `FROM ${aliases[0]} ${first}`,
    ...joins,
    `WHERE ${first}.[period] = ${periods.currentKey}`,
    order,
  ].filter(Boolean).join("\n") + ";";
}

function filtersFor(definition: AtomicMetricDefinition, plan: AnalysisPlan, metricCode: string): string[] {
  const filters = [...(definition.statusFilters ?? [])];
  for (const rule of plan.dimensionRules ?? []) {
    const expression = definition.dimensionExpressions?.[rule.dimension];
    if (expression) filters.push(`${expression} IN (${rule.members.map((member) => `N'${escapeSqlLiteral(member)}'`).join(", ")})`);
  }
  if (plan.filters.some((filter) => filter.op === "overdue" && (filter.metric === metricCode || (filter.metric.startsWith("open_shipping_") && metricCode.startsWith("open_shipping_"))))) {
    filters.push(...(definition.overdueFilters ?? []));
  }
  const customerFilter = plan.customerName ?? plan.dimensionFilters?.customer;
  const customerExpression = definition.dimensionExpressions?.customer;
  if (customerFilter && customerExpression && isSafeCustomerExpression(customerExpression)) {
    filters.push(`${customerExpression} LIKE N'%${escapeSqlLiteral(customerFilter)}%'`);
  }
  const timeRange: AnalysisPlanTimeRange | undefined = plan.timeRange;
  if (!definition.timeField || !timeRange) return filters;
  const comparison = comparisonWindows(plan, definition.timeField);
  if (comparison) {
    filters.push(`((${definition.timeField} >= ${comparison.currentStart} AND ${definition.timeField} < ${comparison.currentEnd}) OR (${definition.timeField} >= ${comparison.previousStart} AND ${definition.timeField} < ${comparison.previousEnd}))`);
    return filters;
  }
  if (timeRange.kind === "current_year") filters.push(`${definition.timeField} >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)`, `${definition.timeField} < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))`);
  if (timeRange.kind === "year_over_year") filters.push(`${definition.timeField} >= DATEFROMPARTS(YEAR(GETDATE()) - 1, 1, 1)`, `${definition.timeField} < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))`);
  if (timeRange.kind === "current_month") filters.push(`${definition.timeField} >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)`, `${definition.timeField} < DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0)`);
  if (timeRange.kind === "previous_month") filters.push(`${definition.timeField} >= DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0)`, `${definition.timeField} < DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)`);
  if (timeRange.kind === "month" && timeRange.month) filters.push(`YEAR(${definition.timeField}) = YEAR(GETDATE())`, `MONTH(${definition.timeField}) = ${timeRange.month}`);
  if (timeRange.kind === "relative" && timeRange.days) filters.push(`${definition.timeField} >= DATEADD(day, -${timeRange.days}, CAST(GETDATE() AS date))`);
  return filters;
}

function buildDimensionRuleValidationCtes(plan: AnalysisPlan): string[] {
  return (plan.dimensionRules ?? []).map((rule) => [
    "category_rule_validation AS (",
    "  SELECT ProdGrup.Company",
    "  FROM Erp.ProdGrup ProdGrup",
    `  WHERE ProdGrup.Description IN (${rule.members.map((member) => `N'${escapeSqlLiteral(member)}'`).join(", ")})`,
    "  GROUP BY ProdGrup.Company",
    `  HAVING COUNT(DISTINCT ProdGrup.Description) = ${rule.members.length}`,
    ")",
  ].join("\n"));
}

function dimensionRuleValidationJoins(plan: AnalysisPlan, definition: AtomicMetricDefinition): string[] {
  if (!(plan.dimensionRules?.length)) return [];
  const company = definition.keyExpressions?.Company ?? `${(definition.requiredTables?.[0] ?? "").replace(/^Erp\./iu, "")}.Company`;
  return [`JOIN category_rule_validation ON category_rule_validation.Company = ${company}`];
}

function dimensionExpressionFor(definition: AtomicMetricDefinition, plan: AnalysisPlan, dimension: string): string {
  const expression = definition.dimensionExpressions?.[dimension] ?? "";
  const rule = plan.dimensionRules?.find((item) => item.dimension === dimension);
  if (!expression || !rule) return expression;
  return `CASE WHEN ${expression} IN (${rule.members.map((member) => `N'${escapeSqlLiteral(member)}'`).join(", ")}) THEN N'${escapeSqlLiteral(rule.target)}' ELSE ${expression} END`;
}

function dimensionRuleScopeColumns(plan: AnalysisPlan): string[] {
  return (plan.dimensionRules ?? []).flatMap((rule) => [
    `N'${escapeSqlLiteral(`${rule.target} = ${rule.members.join(" + ")}`)}' AS [分类合并规则]`,
    "N'ERP 产品类别主数据成员已验证；规则来源：用户陈述' AS [分类规则验证]",
  ]);
}

function periodExpressionFor(plan: AnalysisPlan, definition: AtomicMetricDefinition): string {
  if (!definition.timeField) return "";
  if (plan.comparison && plan.timeGrain === "month") return `CONVERT(char(7), ${definition.timeField}, 120)`;
  if (plan.comparison) return `CONVERT(char(4), ${definition.timeField}, 120)`;
  if (plan.timeGrain === "month") return `CONVERT(char(7), ${definition.timeField}, 120)`;
  if (plan.timeGrain === "year") return `CONVERT(char(4), ${definition.timeField}, 120)`;
  return "";
}

function comparisonWindows(plan: AnalysisPlan, timeField: string) {
  if (!plan.comparison || !plan.timeRange) return undefined;
  const current = timeWindow(plan.timeRange);
  if (!current) return undefined;
  const shift = plan.comparison.kind === "year_over_year" ? "year" : "month";
  return {
    currentStart: current.start,
    currentEnd: current.end,
    previousStart: `DATEADD(${shift}, -1, ${current.start})`,
    previousEnd: `DATEADD(${shift}, -1, ${current.end})`,
    timeField,
  };
}

function comparisonPeriods(plan: AnalysisPlan) {
  if (!plan.comparison || !plan.timeRange) return undefined;
  const current = timeWindow(plan.timeRange);
  if (!current) return undefined;
  const shift = plan.comparison.kind === "year_over_year" ? "year" : "month";
  const width = plan.timeGrain === "month" ? 7 : 4;
  return {
    currentKey: `CONVERT(char(${width}), ${current.start}, 120)`,
    previousKey: `CONVERT(char(${width}), DATEADD(${shift}, -1, ${current.start}), 120)`,
  };
}

function timeWindow(timeRange: AnalysisPlanTimeRange): { start: string; end: string } | undefined {
  if (timeRange.kind === "current_month") return {
    start: "DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)",
    end: "DATEADD(month, DATEDIFF(month, 0, GETDATE()) + 1, 0)",
  };
  if (timeRange.kind === "previous_month") return {
    start: "DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0)",
    end: "DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)",
  };
  if (timeRange.kind === "month" && timeRange.month) return {
    start: `DATEFROMPARTS(YEAR(GETDATE()), ${timeRange.month}, 1)`,
    end: `DATEADD(month, 1, DATEFROMPARTS(YEAR(GETDATE()), ${timeRange.month}, 1))`,
  };
  if (timeRange.kind === "current_year" || timeRange.kind === "year_over_year") return {
    start: "DATEFROMPARTS(YEAR(GETDATE()), 1, 1)",
    end: "DATEADD(day, 1, CAST(GETDATE() AS date))",
  };
  return undefined;
}

function aggregateExpression(expression: string, aggregation = "SUM"): string {
  return /\b(sum|avg|min|max|count)\s*\(/iu.test(expression) ? expression : `${aggregation}(${expression})`;
}

function readDefinition(metric: ApprovedMetricCandidate): AtomicMetricDefinition {
  return metric.definitionJson && typeof metric.definitionJson === "object" && !Array.isArray(metric.definitionJson)
    ? metric.definitionJson as AtomicMetricDefinition
    : {};
}

function sharedJoinKey(definitions: AtomicMetricDefinition[]): string | undefined {
  const [first, ...rest] = definitions.map((definition) => definition.joinKeys ?? []);
  return first?.find((key) => rest.every((keys) => keys.includes(key)));
}

function splitJoinKey(value: string): string[] {
  return value.split("+").map((item) => item.trim()).filter(Boolean);
}

function grainKey(definition: AtomicMetricDefinition): string {
  return Array.isArray(definition.grain) ? definition.grain.join("+") : definition.grain ?? "";
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/gu, "_");
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/gu, "''");
}

function isSafeCustomerExpression(expression: string): boolean {
  return /\b(name|custid|customer)\b|客户/iu.test(expression);
}

function mapMetricReference(metric: ApprovedMetricCandidate): SqlReferenceHint {
  return {
    familyId: metric.familyId,
    businessDescription: metric.businessDescription,
    coreTables: metric.coreTables,
    joins: metric.joins,
    metricCode: metric.metricCode,
    metricName: metric.metricName,
    calculationSummary: metric.calculationSummary,
    definitionJson: metric.definitionJson,
    sourceType: "metric",
    score: metric.score,
    matchedSignals: metric.matchedSignals,
  };
}

export const metricComposerService = new MetricComposerService();
