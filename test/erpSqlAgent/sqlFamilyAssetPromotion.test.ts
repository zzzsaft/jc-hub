import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SqlFamilyAssetPromotionService,
  type SqlFamilyAssetRepository,
  writeSqlFamilyPromotionReviewOutputs,
} from "../../src/features/erpSqlAgent/templates/service/SqlFamilyAssetPromotionService.js";
import { buildSqlFamilyAssetVerificationReport } from "../../src/features/erpSqlAgent/templates/scripts/verifySqlFamilyAssets.js";

test("SQL family asset promotion dry-run does not write and reports target counts", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const report = await new SqlFamilyAssetPromotionService(repo).promote(paths(dir));

  assert.equal(report.summary.templateDraftCount, 5);
  assert.equal(report.summary.referenceFamilyCount, 7);
  assert.equal(report.summary.metricDraftCount, 5);
  assert.equal(repo.templates.length, 0);
  assert.equal(repo.references.length, 0);
  assert.equal(repo.metrics.length, 0);
});

test("SQL family asset promotion apply writes drafts and keeps reference/metric out of templates", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const report = await new SqlFamilyAssetPromotionService(repo).promote({ ...paths(dir), apply: true });

  assert.equal(report.summary.templateDraftCount, 5);
  assert.equal(repo.templates.length, 5);
  assert.equal(repo.references.length, 7);
  assert.equal(repo.metrics.length, 5);
  assert.deepEqual(repo.templates.map((template) => template.familyId).sort(), ["family_016", "family_037", "family_050", "family_062", "family_076"]);
  assert(!repo.templates.some((template) => template.familyId === "family_002" || template.familyId === "family_013"));
});

test("promoted template SQL is macro-free and SELECT-only draft material", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  await new SqlFamilyAssetPromotionService(repo).promote({ ...paths(dir), apply: true });

  for (const template of repo.templates) {
    assert.match(template.sqlTemplate, /^\s*SELECT\b/i);
    assert.doesNotMatch(template.sqlTemplate, /\$\{/);
    assert.doesNotMatch(template.sqlTemplate, /\b(DECLARE|EXEC|DROP|CREATE|INSERT|UPDATE|DELETE)\b/i);
    assert.doesNotMatch(template.sqlTemplate, /\bSELECT\s+INTO\s+#/i);
    assert.equal(template.queryPlanJson.sourceFamilyId, template.familyId);
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

test("SQL family asset promotion apply is repeatable through repository upserts", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const service = new SqlFamilyAssetPromotionService(repo);

  await service.promote({ ...paths(dir), apply: true });
  await service.promote({ ...paths(dir), apply: true });

  assert.equal(repo.templates.length, 10);
  assert.equal(new Set(repo.templates.map((template) => `${template.familyId}:${template.intent}`)).size, 5);
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
  assert.equal(json.summary.templateDraftCount, 5);
  assert.equal((markdown.match(/^### family_0(?:50|62|76|16|37) /gm) ?? []).length, 5);
  assert(markdown.includes("sql_template"));
  assert(markdown.includes("SELECT\n  p.Company AS [公司]"));
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
    referenceFamilies: ["family_002", "family_009", "family_021", "family_023", "family_025", "family_035", "family_075"].map((familyId) => ({
      familyId,
      recommendedUse: "reference_retrieval",
      isEnabled: true,
    })),
    metricDrafts: ["family_013", "family_024", "family_036", "family_057", "family_059"].map((familyId) => ({
      familyId,
      status: "draft",
    })),
    unexpectedTemplateFamilies: [],
  });

  assert.equal(report.summary.templateDraftFound, 5);
  assert.equal(report.summary.referenceFamilyFound, 7);
  assert.equal(report.summary.metricDraftFound, 5);
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
