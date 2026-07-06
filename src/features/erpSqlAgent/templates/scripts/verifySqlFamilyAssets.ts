import "../../../../config/env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import { parseArgs, requireArg } from "./cli.js";

const TEMPLATE_FAMILY_IDS = ["family_050", "family_062", "family_076", "family_016", "family_037"] as const;
const REFERENCE_FAMILY_IDS = ["family_002", "family_009", "family_021", "family_023", "family_025", "family_035", "family_075"] as const;
const METRIC_FAMILY_IDS = ["family_013", "family_024", "family_036", "family_057", "family_059"] as const;
const UNEXPECTED_TEMPLATE_FAMILY_IDS = [...REFERENCE_FAMILY_IDS, ...METRIC_FAMILY_IDS];
const BANNED_SQL_PATTERN = /\$\{|\b(DECLARE|DROP|UPDATE|DELETE|INSERT|EXEC|EXECUTE)\b/iu;

type TemplateDraftRow = {
  familyId: string;
  name: string;
  approved: boolean;
  approvalStatus: string;
  guardPassed: boolean;
  sourceType: string;
  optionalParams: unknown;
  sqlTemplate: string;
};

type ReferenceFamilyRow = {
  familyId: string;
  recommendedUse: string;
  isEnabled: boolean;
};

type MetricDraftRow = {
  familyId: string;
  status: string;
};

type UnexpectedTemplateRow = {
  familyId: string;
  name: string;
};

export type SqlFamilyAssetVerificationReport = {
  summary: {
    templateDraftFound: number;
    referenceFamilyFound: number;
    metricDraftFound: number;
    unexpectedTemplateFamilyCount: number;
    failedCount: number;
  };
  templateDrafts: Array<TemplateDraftRow & { checks: Record<string, boolean> }>;
  referenceFamilies: Array<ReferenceFamilyRow & { checks: Record<string, boolean> }>;
  metricDrafts: Array<MetricDraftRow & { checks: Record<string, boolean> }>;
  unexpectedTemplateFamilies: UnexpectedTemplateRow[];
  failures: string[];
};

export function buildSqlFamilyAssetVerificationReport(input: {
  templateDrafts: TemplateDraftRow[];
  referenceFamilies: ReferenceFamilyRow[];
  metricDrafts: MetricDraftRow[];
  unexpectedTemplateFamilies: UnexpectedTemplateRow[];
}): SqlFamilyAssetVerificationReport {
  const failures: string[] = [];
  const templateDrafts = input.templateDrafts.map((row) => ({
    ...row,
    checks: {
      approvedFalse: row.approved === false,
      approvalStatusDraft: row.approvalStatus === "draft",
      guardPassedFalse: row.guardPassed === false,
      sourceTypeFineReportFamily: row.sourceType === "finereport_family",
      sqlSafe: !BANNED_SQL_PATTERN.test(row.sqlTemplate),
      family062DueBeforeDate: row.familyId !== "family_062" || (hasParam(row.optionalParams, "dueBeforeDate") && !hasParam(row.optionalParams, "daysBeforeDue")),
      family076PartNum: row.familyId !== "family_076" || (row.sqlTemplate.includes("jm.PartNum") && !row.sqlTemplate.includes("jm.MtlPartNum")),
    },
  }));
  const referenceFamilies = input.referenceFamilies.map((row) => ({
    ...row,
    checks: {
      recommendedUse: row.recommendedUse === "reference_retrieval",
      enabled: row.isEnabled === true,
    },
  }));
  const metricDrafts = input.metricDrafts.map((row) => ({
    ...row,
    checks: {
      statusDraft: row.status === "draft",
    },
  }));

  for (const familyId of TEMPLATE_FAMILY_IDS) if (!templateDrafts.some((row) => row.familyId === familyId)) failures.push(`Missing template draft: ${familyId}`);
  for (const familyId of REFERENCE_FAMILY_IDS) if (!referenceFamilies.some((row) => row.familyId === familyId)) failures.push(`Missing reference family: ${familyId}`);
  for (const familyId of METRIC_FAMILY_IDS) if (!metricDrafts.some((row) => row.familyId === familyId)) failures.push(`Missing metric draft: ${familyId}`);
  for (const row of templateDrafts) for (const [name, ok] of Object.entries(row.checks)) if (!ok) failures.push(`Template ${row.familyId} failed ${name}`);
  for (const row of referenceFamilies) for (const [name, ok] of Object.entries(row.checks)) if (!ok) failures.push(`Reference ${row.familyId} failed ${name}`);
  for (const row of metricDrafts) for (const [name, ok] of Object.entries(row.checks)) if (!ok) failures.push(`Metric ${row.familyId} failed ${name}`);
  for (const row of input.unexpectedTemplateFamilies) failures.push(`Unexpected family in erp_query_templates: ${row.familyId}`);

  return {
    summary: {
      templateDraftFound: templateDrafts.length,
      referenceFamilyFound: referenceFamilies.length,
      metricDraftFound: metricDrafts.length,
      unexpectedTemplateFamilyCount: input.unexpectedTemplateFamilies.length,
      failedCount: failures.length,
    },
    templateDrafts,
    referenceFamilies,
    metricDrafts,
    unexpectedTemplateFamilies: input.unexpectedTemplateFamilies,
    failures,
  };
}

async function verifyAssets(families: string[]): Promise<SqlFamilyAssetVerificationReport> {
  const expected = [...TEMPLATE_FAMILY_IDS, ...REFERENCE_FAMILY_IDS, ...METRIC_FAMILY_IDS];
  const missingExpected = expected.filter((familyId) => !families.includes(familyId));
  if (missingExpected.length) throw new Error(`Missing --families entries: ${missingExpected.join(",")}`);

  const [templateDrafts, referenceFamilies, metricDrafts, unexpectedTemplateFamilies] = await Promise.all([
    prisma.$queryRaw<TemplateDraftRow[]>(Prisma.sql`
      SELECT
        source_family_id AS "familyId",
        name,
        approved,
        approval_status AS "approvalStatus",
        guard_passed AS "guardPassed",
        source_type AS "sourceType",
        optional_params AS "optionalParams",
        sql_template AS "sqlTemplate"
      FROM "agent"."erp_query_templates"
      WHERE source_family_id IN (${Prisma.join(TEMPLATE_FAMILY_IDS)})
      ORDER BY source_family_id
    `),
    prisma.$queryRaw<ReferenceFamilyRow[]>(Prisma.sql`
      SELECT family_id AS "familyId", recommended_use AS "recommendedUse", is_enabled AS "isEnabled"
      FROM "agent"."erp_sql_reference_family"
      WHERE family_id IN (${Prisma.join(REFERENCE_FAMILY_IDS)})
      ORDER BY family_id
    `),
    prisma.$queryRaw<MetricDraftRow[]>(Prisma.sql`
      SELECT family_id AS "familyId", status
      FROM "agent"."business_metric_catalog"
      WHERE family_id IN (${Prisma.join(METRIC_FAMILY_IDS)})
      ORDER BY family_id
    `),
    prisma.$queryRaw<UnexpectedTemplateRow[]>(Prisma.sql`
      SELECT source_family_id AS "familyId", name
      FROM "agent"."erp_query_templates"
      WHERE source_family_id IN (${Prisma.join(UNEXPECTED_TEMPLATE_FAMILY_IDS)})
      ORDER BY source_family_id
    `),
  ]);

  return buildSqlFamilyAssetVerificationReport({ templateDrafts, referenceFamilies, metricDrafts, unexpectedTemplateFamilies });
}

async function writeReport(report: SqlFamilyAssetVerificationReport, options: { out: string; mdOut?: string }): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await fs.writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (options.mdOut) {
    await fs.mkdir(path.dirname(path.resolve(options.mdOut)), { recursive: true });
    await fs.writeFile(options.mdOut, renderMarkdown(report), "utf8");
  }
}

function renderMarkdown(report: SqlFamilyAssetVerificationReport): string {
  return `${[
    "# SQL Family Asset Apply Verification",
    "",
    "## Summary",
    "",
    `- templateDraftFound: ${report.summary.templateDraftFound}`,
    `- referenceFamilyFound: ${report.summary.referenceFamilyFound}`,
    `- metricDraftFound: ${report.summary.metricDraftFound}`,
    `- unexpectedTemplateFamilyCount: ${report.summary.unexpectedTemplateFamilyCount}`,
    `- failedCount: ${report.summary.failedCount}`,
    "",
    "## Failures",
    "",
    ...(report.failures.length ? report.failures.map((failure) => `- ${failure}`) : ["- none"]),
    "",
  ].join("\n")}\n`;
}

function hasParam(params: unknown, name: string): boolean {
  if (Array.isArray(params)) return params.includes(name);
  return Boolean(params && typeof params === "object" && name in params);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await verifyAssets(requireArg(args, "families").split(",").filter(Boolean));
  await writeReport(report, {
    out: requireArg(args, "out"),
    mdOut: typeof args["md-out"] === "string" ? args["md-out"] : undefined,
  });
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.summary.failedCount > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
