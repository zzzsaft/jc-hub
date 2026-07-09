import type { SqlGenerationResult, SqlGeneratorGuard, SqlReferenceHint } from "../../generator/index.js";
import { sqlGuardService, type FinanceSqlMode } from "../../sqlGuard/index.js";
import type { ApprovedMetricCandidate } from "../../templates/repository/SqlTemplateRepository.js";
import type { AnalysisPlan, AnalysisPlanTimeRange } from "../types/SqlPlannerTypes.js";

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
      return { ok: false, error: "approved atomic metrics grain/joinKeys 不兼容，不能组合生成 SQL。" };
    }

    const missingDimensions = input.analysisPlan.dimensions.filter((dimension) =>
      definitions.some((definition) => !definition.dimensions?.includes(dimension) || !definition.dimensionExpressions?.[dimension])
    );
    if (missingDimensions.length > 0) {
      return { ok: false, error: `approved atomic metric 缺少维度表达式: ${[...new Set(missingDimensions)].join(", ")}` };
    }
    if (input.analysisPlan.timeGrain && definitions.some((definition) => !definition.timeField)) {
      return { ok: false, error: `approved atomic metric 缺少时间字段，不能按 ${input.analysisPlan.timeGrain} 聚合。` };
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
    const ctes = definitions.map((definition, index) => buildMetricCte(metrics[index], definition, input.analysisPlan, keyFields));
    const unsupported = ctes.find((cte) => cte.error);
    if (unsupported?.error) return { ok: false, error: unsupported.error };

    const aliases = metrics.map((metric) => safeName(metric.metricCode));
    const sql = [
      `WITH ${ctes.map((cte) => cte.sql).join(",\n")}`,
      buildOuterSelect(input.analysisPlan, metrics, definitions, aliases, keyFields),
    ].join("\n");
    const references = metrics.map(mapMetricReference);
    const guardStartedAt = Date.now();
    const guardResult = await this.guard.validate(sql, {
      module: input.financeMode ? "finance" : undefined,
      financeMode: input.financeMode,
      references,
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
  ];
  const keySelects = keyFields.map((key) => `${definition.keyExpressions?.[key] ?? `${alias}.${key}`} AS ${key}`);
  const periodExpression = periodExpressionFor(plan, definition);
  const dimensionSelects = plan.dimensions
    .map((dimension) => definition.dimensionExpressions?.[dimension] ? `${definition.dimensionExpressions[dimension]} AS [${dimension}]` : "")
    .filter(Boolean);
  const timeSelect = definition.timeField ? [`MIN(${definition.timeField}) AS [__timeField]`] : [];
  const metricExpression = aggregateExpression(expression, definition.aggregation);
  const where = filtersFor(definition, plan, metric.metricCode).join("\n  AND ");
  const groupBy = [
    ...keyFields.map((key) => definition.keyExpressions?.[key] ?? `${alias}.${key}`),
    periodExpression,
    ...plan.dimensions.map((dimension) => definition.dimensionExpressions?.[dimension]).filter((item): item is string => Boolean(item)),
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

function filtersFor(definition: AtomicMetricDefinition, plan: AnalysisPlan, metricCode: string): string[] {
  const filters = [...(definition.statusFilters ?? [])];
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
  if (timeRange.kind === "current_year") filters.push(`${definition.timeField} >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)`, `${definition.timeField} < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))`);
  if (timeRange.kind === "year_over_year") filters.push(`${definition.timeField} >= DATEFROMPARTS(YEAR(GETDATE()) - 1, 1, 1)`, `${definition.timeField} < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))`);
  if (timeRange.kind === "month" && timeRange.month) filters.push(`YEAR(${definition.timeField}) = YEAR(GETDATE())`, `MONTH(${definition.timeField}) = ${timeRange.month}`);
  if (timeRange.kind === "relative" && timeRange.days) filters.push(`${definition.timeField} >= DATEADD(day, -${timeRange.days}, CAST(GETDATE() AS date))`);
  return filters;
}

function periodExpressionFor(plan: AnalysisPlan, definition: AtomicMetricDefinition): string {
  if (!definition.timeField) return "";
  if (plan.timeGrain === "month") return `CONVERT(char(7), ${definition.timeField}, 120)`;
  if (plan.timeGrain === "year") return `CONVERT(char(4), ${definition.timeField}, 120)`;
  return "";
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
