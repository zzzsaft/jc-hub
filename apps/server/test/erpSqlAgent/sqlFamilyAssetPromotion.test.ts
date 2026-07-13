import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SqlFamilyAssetPromotionService,
  type SqlFamilyAssetRepository,
  writeSqlFamilyPromotionReviewOutputs,
} from "../../src/modules/erpSqlAgent/templates/service/SqlFamilyAssetPromotionService.js";
import { buildSqlFamilyAssetVerificationReport } from "../../src/modules/erpSqlAgent/templates/scripts/verifySqlFamilyAssets.js";

test("SQL family asset promotion dry-run does not write and reports target counts", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const report = await new SqlFamilyAssetPromotionService(repo).promote(paths(dir));

  assert.equal(report.summary.templateDraftCount, 7);
  assert.equal(report.summary.referenceFamilyCount, 14);
  assert.equal(report.summary.metricDraftCount, 13);
  assert.equal(repo.templates.length, 0);
  assert.equal(repo.references.length, 0);
  assert.equal(repo.metrics.length, 0);
});

test("SQL family asset promotion apply writes drafts and keeps reference/metric out of templates", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const report = await new SqlFamilyAssetPromotionService(repo).promote({ ...paths(dir), apply: true });

  assert.equal(report.summary.templateDraftCount, 7);
  assert.equal(repo.templates.length, 7);
  assert.equal(repo.references.length, 14);
  assert.equal(repo.metrics.length, 13);
  assert.deepEqual(repo.templates.map((template) => template.familyId).sort(), ["family_016", "family_037", "family_038", "family_050", "family_062", "family_076", "family_092"]);
  assert(!repo.templates.some((template) => template.familyId === "family_002" || template.familyId === "family_013"));
});

test("promoted template SQL is macro-free and SELECT-only draft material", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  await new SqlFamilyAssetPromotionService(repo).promote({ ...paths(dir), apply: true });

  for (const template of repo.templates) {
    assert.match(template.sqlTemplate, /^\s*SELECT\s+TOP\s+100\b/i);
    assert.doesNotMatch(template.sqlTemplate, /\$\{/);
    assert.doesNotMatch(template.sqlTemplate, /\b(DECLARE|EXEC|DROP|CREATE|INSERT|UPDATE|DELETE)\b/i);
    assert.doesNotMatch(template.sqlTemplate, /\bSELECT\s+INTO\s+#/i);
    assert.equal(template.queryPlanJson.sourceFamilyId, template.familyId);
  }
});

test("operation assets use verified Company joins and bounded read-only SQL", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));
  const templates = new Map(report.templateDrafts.map((item) => [item.familyId, item]));

  for (const familyId of ["family_038", "family_092"]) {
    const template = templates.get(familyId);
    assert(template, familyId);
    assert.match(template.sqlTemplate, /^SELECT TOP 100/u);
    assert.match(template.sqlTemplate, /@companyScope IS NULL/u);
  }
  assert.equal(templates.has("family_014"), false);
  assert.match(templates.get("family_092")!.sqlTemplate, /FROM Erp\.LaborDtl ld/u);
  assert.match(templates.get("family_038")!.sqlTemplate, /FROM Erp\.OpMaster om/u);
});

test("sales customer filters also match customer code abbreviations", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));

  for (const familyId of ["family_016", "family_037"]) {
    const template = report.templateDrafts.find((item) => item.familyId === familyId);
    assert(template);
    assert.match(template.sqlTemplate, /c\.CustID LIKE CONCAT\('%', @customerName, '%'\)/u);
  }
});

test("family_062 uses dueBeforeDate date filter", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));
  const template = report.templateDrafts.find((item) => item.familyId === "family_062");

  assert(template);
  assert(template.optionalParams.includes("dueBeforeDate"));
  assert(template.queryPlanJson.filters.includes("dueBeforeDate"));
  assert(template.queryPlanJson.params.optional.includes("dueBeforeDate"));
  assert.match(template.sqlTemplate, /@dueBeforeDate IS NULL OR COALESCE\(por\.PromiseDt, por\.DueDate\) <= @dueBeforeDate/u);
  assert.doesNotMatch(JSON.stringify(template), new RegExp(`days${"Before"}Due|DATEADD\\(day`, "u"));
});

test("finance skeleton metrics cover high-risk families and keep variable parts", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));
  const skeletons = report.metricDrafts.filter((item) => item.familyId.startsWith("finance_skeleton_"));

  assert.equal(skeletons.length, 8);
  assert.deepEqual(skeletons.map((item) => item.metricCode), [
    "finance_summary",
    "finance_detail",
    "finance_period_compare",
    "finance_group_ranking",
    "finance_exception_check",
    "finance_ar_cash_diff",
    "finance_refund_writeoff",
    "finance_join_metric",
  ]);
  for (const skeleton of skeletons) {
    assert.equal(skeleton.module, "finance");
    assert(["skeleton", "draft_definition"].includes(skeleton.definitionJson.status));
    assert(skeleton.definitionJson.variableParts.includes("timeRange"));
    assert(skeleton.definitionJson.requiredControls.includes("amountField"));
    assert.equal(skeleton.representativeSql, "");
  }
});

test("metric drafts carry definition skeletons", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  await new SqlFamilyAssetPromotionService(repo).promote({ ...paths(dir), apply: true });

  assert(repo.metrics.every((metric) => ["skeleton", "draft_definition"].includes(metric.definitionJson.status)));
  assert(repo.metrics.some((metric) => metric.familyId === "finance_skeleton_join_metric" && metric.params.includes("joinKeys")));
});

test("finance skeletons carry draft definitions", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));
  const byCode = new Map(report.metricDrafts.map((metric) => [metric.metricCode, metric]));

  for (const metricCode of [
    "finance_summary",
    "finance_detail",
    "finance_period_compare",
    "finance_group_ranking",
    "finance_exception_check",
    "finance_ar_cash_diff",
    "finance_refund_writeoff",
    "finance_join_metric",
  ]) {
    assert.equal(byCode.get(metricCode)?.definitionJson.status, "draft_definition");
  }
  assert.equal(byCode.get("finance_summary")?.definitionJson.timeField, "Erp.InvcHead.ApplyDate");
  assert.deepEqual(byCode.get("finance_summary")?.definitionJson.requiredTables, ["Erp.InvcHead", "Erp.InvcDtl"]);
  assert.equal(byCode.get("finance_detail")?.definitionJson.detailGrain, "one row per invoice line unless user asks invoice header summary");
  assert.deepEqual(byCode.get("finance_period_compare")?.definitionJson.outputMeasures, ["currentAmount", "previousAmount", "deltaAmount", "deltaRate"]);
  assert.equal(byCode.get("finance_group_ranking")?.definitionJson.limitPolicy, "default TOP 10 for ranking; user limit may override within guard limit");
  assert((byCode.get("finance_exception_check")?.definitionJson.defaultExceptionRules as string[]).includes("zero_or_negative_amount"));
  assert.equal(byCode.get("finance_ar_cash_diff")?.definitionJson.refundPolicy, "deduct only rows matched to approved refund/writeoff definition");
  assert.deepEqual(byCode.get("finance_refund_writeoff")?.definitionJson.requiredTables, ["Erp.RMADtl", "Erp.RMAHead"]);
  assert((byCode.get("finance_join_metric")?.definitionJson.allowedJoinKeys as string[]).includes("Company + InvoiceNum"));
  assert((byCode.get("finance_refund_writeoff")?.definitionJson.approvalBlockers as string[]).includes("确认退款日期字段"));
});

test("SQL family asset promotion apply is repeatable through repository upserts", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const service = new SqlFamilyAssetPromotionService(repo);

  await service.promote({ ...paths(dir), apply: true });
  await service.promote({ ...paths(dir), apply: true });

  assert.equal(repo.templates.length, 14);
  assert.equal(new Set(repo.templates.map((template) => `${template.familyId}:${template.intent}`)).size, 7);
});

test("SQL family asset promotion reports missing input files clearly", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sql-family-assets-"));
  await assert.rejects(
    new SqlFamilyAssetPromotionService(recordingRepo()).promote({
      classificationPath: path.join(dir, "missing-classification.json"),
      businessSamplesPath: path.join(dir, "samples.json"),
    }),
    /Missing classification file:/,
  );

  await fs.writeFile(path.join(dir, "classification.json"), JSON.stringify({ families: [] }), "utf8");
  await assert.rejects(
    new SqlFamilyAssetPromotionService(recordingRepo()).promote({
      classificationPath: path.join(dir, "classification.json"),
      businessSamplesPath: path.join(dir, "missing-samples.json"),
    }),
    /Missing business samples file:/,
  );
});

test("SQL family promotion review outputs markdown and json without writing database", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const report = await new SqlFamilyAssetPromotionService(repo).promote(paths(dir));
  const reviewOut = path.join(dir, "review.md");
  const jsonOut = path.join(dir, "review.json");

  await writeSqlFamilyPromotionReviewOutputs(report, { reviewOut, jsonOut, applyCommand: "npm run sql-family:promote-assets -- --apply" });

  const markdown = await fs.readFile(reviewOut, "utf8");
  const json = JSON.parse(await fs.readFile(jsonOut, "utf8")) as typeof report;
  assert.equal(repo.templates.length, 0);
  assert.equal(json.summary.templateDraftCount, 7);
  assert.equal(json.summary.metricDraftCount, 13);
  assert.equal(json.templateDrafts.length, 7);
  assert.equal((markdown.match(/^### finance_skeleton_/gm) ?? []).length, 8);
  assert(markdown.includes("sql_template"));
  assert(markdown.includes("SELECT TOP 100\n  p.Company AS [公司]"));
  assert(markdown.includes("- [ ] 不包含 FineReport 宏 `${...}`"));
});

test("SQL family promotion review output is a no-op when no output paths are set", async () => {
  const dir = await fixtureDir();
  const report = await new SqlFamilyAssetPromotionService(recordingRepo()).promote(paths(dir));

  await writeSqlFamilyPromotionReviewOutputs(report, {});

  assert.equal((await fs.readdir(dir)).sort().join(","), "classification.json,samples.json");
});

test("SQL family asset verification accepts draft-only applied assets", () => {
  const report = buildSqlFamilyAssetVerificationReport({
    templateDrafts: ["family_050", "family_062", "family_076", "family_016", "family_037"].map((familyId) => ({
      familyId,
      name: familyId,
      approved: false,
      approvalStatus: "draft",
      guardPassed: false,
      sourceType: "finereport_family",
      optionalParams: familyId === "family_062" ? { dueBeforeDate: {} } : {},
      sqlTemplate: familyId === "family_076" ? "SELECT jm.PartNum FROM Erp.JobMtl jm" : "SELECT Company FROM Erp.Part",
    })),
    referenceFamilies: ["family_050", "family_062", "family_076", "family_016", "family_037", "family_002", "family_009", "family_021", "family_023", "family_025", "family_035", "family_075"].map((familyId) => ({
      familyId,
      recommendedUse: "reference_retrieval",
      isEnabled: true,
    })),
    metricDrafts: [
      "family_013",
      "family_024",
      "family_036",
      "family_057",
      "family_059",
      "finance_skeleton_summary",
      "finance_skeleton_detail",
      "finance_skeleton_period_compare",
      "finance_skeleton_group_ranking",
      "finance_skeleton_exception_check",
      "finance_skeleton_ar_cash_diff",
      "finance_skeleton_refund_writeoff",
      "finance_skeleton_join_metric",
    ].map((familyId) => ({
      familyId,
      status: "draft",
    })),
    unexpectedTemplateFamilies: [],
  });

  assert.equal(report.summary.templateDraftFound, 5);
  assert.equal(report.summary.referenceFamilyFound, 12);
  assert.equal(report.summary.metricDraftFound, 13);
  assert.equal(report.summary.unexpectedTemplateFamilyCount, 0);
  assert.equal(report.summary.failedCount, 0);
});

function recordingRepo(): SqlFamilyAssetRepository & {
  templates: Array<Parameters<SqlFamilyAssetRepository["upsertTemplateDraft"]>[0]>;
  references: Array<Parameters<SqlFamilyAssetRepository["upsertReferenceFamily"]>[0]>;
  metrics: Array<Parameters<SqlFamilyAssetRepository["upsertMetricDraft"]>[0]>;
} {
  const repo = {
    templates: [] as Array<Parameters<SqlFamilyAssetRepository["upsertTemplateDraft"]>[0]>,
    references: [] as Array<Parameters<SqlFamilyAssetRepository["upsertReferenceFamily"]>[0]>,
    metrics: [] as Array<Parameters<SqlFamilyAssetRepository["upsertMetricDraft"]>[0]>,
    async upsertTemplateDraft(input: Parameters<SqlFamilyAssetRepository["upsertTemplateDraft"]>[0]) {
      repo.templates.push(input);
    },
    async upsertReferenceFamily(input: Parameters<SqlFamilyAssetRepository["upsertReferenceFamily"]>[0]) {
      repo.references.push(input);
    },
    async upsertMetricDraft(input: Parameters<SqlFamilyAssetRepository["upsertMetricDraft"]>[0]) {
      repo.metrics.push(input);
    },
  };
  return repo;
}

async function fixtureDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sql-family-assets-"));
  await fs.writeFile(path.join(dir, "classification.json"), JSON.stringify({ families: FAMILY_IDS.map((familyId) => ({ familyId })) }), "utf8");
  await fs.writeFile(path.join(dir, "samples.json"), JSON.stringify({ businessFamilies: FAMILY_IDS.map(makeFamily) }), "utf8");
  return dir;
}

function paths(dir: string) {
  return {
    classificationPath: path.join(dir, "classification.json"),
    businessSamplesPath: path.join(dir, "samples.json"),
  };
}

function makeFamily(familyId: string) {
  return {
    familyId,
    reportNames: [`${familyId}报表`],
    datasetNames: ["ds1"],
    moduleGuess: "production",
    coreTables: ["Erp.JobHead"],
    coreJoins: ["Erp.JobHead -> Erp.JobOper ON Company + JobNum"],
    params: ["company"],
    representativeDatasetId: 1,
    representativeSql: "SELECT Company FROM Erp.JobHead",
    sampleDatasetIds: [1, 2],
    hasFanruanMacroCount: 1,
    hasNonSelectRiskCount: 0,
    hasHardcodedCompanyCount: 1,
  };
}

const FAMILY_IDS = [
  "family_050",
  "family_062",
  "family_076",
  "family_016",
  "family_037",
  "family_038",
  "family_092",
  "family_002",
  "family_009",
  "family_021",
  "family_023",
  "family_025",
  "family_035",
  "family_075",
  "family_013",
  "family_024",
  "family_036",
  "family_057",
  "family_059",
];
