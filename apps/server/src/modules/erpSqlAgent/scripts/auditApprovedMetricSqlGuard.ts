import "../../../config/env.js";

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { metricComposerService } from "../planner/index.js";
import type { AnalysisPlan } from "../planner/index.js";
import type { ApprovedMetricCandidate } from "../templates/repository/SqlTemplateRepository.js";

type MetricRow = {
  familyId: string;
  metricCode: string;
  metricName: string;
  businessDescription: string;
  calculationSummary: string;
  coreTables: unknown;
  coreJoins: unknown;
  params: unknown;
  definitionJson: unknown;
  representativeSql: string | null;
};

type AuditResult = {
  metricCode: string;
  dimension?: string;
  timeGrain?: AnalysisPlan["timeGrain"];
  ok: boolean;
  errors: string[];
  warnings: string[];
};

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<MetricRow[]>(Prisma.sql`
    SELECT
      family_id AS "familyId",
      metric_code AS "metricCode",
      metric_name AS "metricName",
      business_description AS "businessDescription",
      calculation_summary AS "calculationSummary",
      core_tables AS "coreTables",
      core_joins AS "coreJoins",
      params,
      definition_json AS "definitionJson",
      representative_sql AS "representativeSql"
    FROM "erp_agent"."business_metric_catalog"
    WHERE status = 'approved'
      AND definition_json->>'kind' = 'atomic_metric'
    ORDER BY metric_code
  `);

  const results: AuditResult[] = [];
  for (const metric of rows.map(mapMetric)) {
    const definition = readRecord(metric.definitionJson);
    const dimensions = readStringArray(definition.dimensions);
    const plans = [
      buildPlan(metric.metricCode, []),
      ...dimensions.map((dimension) => buildPlan(metric.metricCode, [dimension])),
      ...(typeof definition.timeField === "string" ? [buildPlan(metric.metricCode, [], "year")] : []),
    ];
    for (const plan of plans) {
      const result = await metricComposerService.compose({
        question: `audit ${metric.metricCode}`,
        analysisPlan: plan,
        metrics: [metric],
        financeMode: "estimate",
      });
      results.push({
        metricCode: metric.metricCode,
        dimension: plan.dimensions[0],
        timeGrain: plan.timeGrain,
        ok: result.ok && result.generation.valid,
        errors: result.ok ? result.generation.guardResult.errors : [result.error],
        warnings: result.ok ? result.generation.warnings : [],
      });
    }
  }

  console.log(JSON.stringify({
    total: results.length,
    failed: results.filter((item) => !item.ok).length,
    byError: results.filter((item) => !item.ok).reduce<Record<string, number>>((counts, item) => {
      const key = classify(item.errors);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    results,
  }, null, 2));
}

function buildPlan(metricCode: string, dimensions: string[], timeGrain?: "year"): AnalysisPlan {
  return {
    mode: "decision_support",
    grain: dimensions,
    metrics: [metricCode],
    filters: [],
    dimensions,
    orderBy: [],
    ...(timeGrain ? { timeGrain, timeRange: { kind: "year_over_year" } } : {}),
  };
}

function mapMetric(row: MetricRow): ApprovedMetricCandidate {
  return {
    familyId: row.familyId,
    metricCode: row.metricCode,
    metricName: row.metricName,
    businessDescription: row.businessDescription,
    calculationSummary: row.calculationSummary,
    coreTables: readStringArray(row.coreTables),
    joins: readStringArray(row.coreJoins),
    params: readStringArray(row.params),
    definitionJson: row.definitionJson,
    ...(row.representativeSql ? { exampleSql: row.representativeSql } : {}),
    score: 1,
    matchedSignals: [`metric:${row.metricCode}`],
  };
}

function classify(errors: string[]): string {
  const text = errors.join("\n");
  if (/Referenced field does not exist in schema metadata/iu.test(text)) return "missing_field";
  if (/Referenced table does not exist in schema metadata/iu.test(text)) return "missing_table";
  return "invalid_sql";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
