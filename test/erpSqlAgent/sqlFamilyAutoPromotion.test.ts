import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SqlFamilyAutoPromotionService, compactSqlFamilyAutoPromotionReport, type SqlFamilyAutoPromotionRepository } from "../../src/modules/erpSqlAgent/templates/service/SqlFamilyAutoPromotionService.js";
import { SqlTemplateDraftValidationService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateDraftValidationService.js";
import type { ErpSqlQueryResult } from "../../src/modules/erpSqlAgent/query/index.js";

const BATCH2 = ["family_027", "family_014", "family_038", "family_086", "family_089", "family_092", "family_031", "family_006", "family_008", "family_080"];

test("auto-promote dry-run routes batch2 templates and references with compact SQL redaction", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const service = new SqlFamilyAutoPromotionService(repo, new SqlTemplateDraftValidationService(fakeQueryClient()));

  const report = await service.promote({
    classificationPath: path.join(dir, "classification.json"),
    businessSamplesPath: path.join(dir, "samples.json"),
    families: BATCH2,
    company: "jctimes",
  });
  const compact = compactSqlFamilyAutoPromotionReport(report);

  assert.equal(report.summary.inputFamilies, 10);
  assert.equal(report.summary.appliedTemplateDrafts, 6);
  assert.equal(report.summary.downgradedReferences, 4);
  assert.equal(report.summary.registeredMetricDrafts, 0);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(report.appliedTemplates.map((item) => item.familyId).sort(), ["family_014", "family_027", "family_038", "family_086", "family_089", "family_092"]);
  assert.deepEqual(report.downgradedReferences.map((item) => item.familyId).sort(), ["family_006", "family_008", "family_031", "family_080"]);
  assert.equal(repo.templates.length, 0);
  assert.equal(repo.references.length, 0);
  assert(!JSON.stringify(compact).includes("SELECT"));
  assert(!JSON.stringify(compact).includes("sqlTemplate"));
  assert(!JSON.stringify(compact).includes("representativeSql"));
});

test("auto-promote apply writes only draft templates and reference rows", async () => {
  const dir = await fixtureDir();
  const repo = recordingRepo();
  const service = new SqlFamilyAutoPromotionService(repo, new SqlTemplateDraftValidationService(fakeQueryClient()));

  const report = await service.promote({
    classificationPath: path.join(dir, "classification.json"),
    businessSamplesPath: path.join(dir, "samples.json"),
    families: BATCH2,
    company: "jctimes",
    apply: true,
  });

  assert.equal(repo.templates.length, 6);
  assert.equal(repo.references.length, 4);
  assert.equal(repo.metrics.length, 0);
  assert.equal(report.verification?.summary.templateDraftFound, 6);
  for (const template of repo.templates) {
    assert.match(template.sqlTemplate, /^\s*SELECT\b/iu);
    assert.doesNotMatch(template.sqlTemplate, /\$\{|\b(DECLARE|EXEC|DROP|INSERT|UPDATE|DELETE)\b|SELECT\s+INTO\s+#/iu);
  }
});

function recordingRepo(): SqlFamilyAutoPromotionRepository & {
  templates: Array<Parameters<SqlFamilyAutoPromotionRepository["upsertTemplateDraft"]>[0]>;
  references: Array<Parameters<SqlFamilyAutoPromotionRepository["upsertReferenceFamily"]>[0]>;
  metrics: Array<Parameters<SqlFamilyAutoPromotionRepository["upsertMetricDraft"]>[0]>;
} {
  const repo = {
    templates: [] as Array<Parameters<SqlFamilyAutoPromotionRepository["upsertTemplateDraft"]>[0]>,
    references: [] as Array<Parameters<SqlFamilyAutoPromotionRepository["upsertReferenceFamily"]>[0]>,
    metrics: [] as Array<Parameters<SqlFamilyAutoPromotionRepository["upsertMetricDraft"]>[0]>,
    async upsertTemplateDraft(input: Parameters<SqlFamilyAutoPromotionRepository["upsertTemplateDraft"]>[0]) {
      repo.templates.push(input);
    },
    async upsertReferenceFamily(input: Parameters<SqlFamilyAutoPromotionRepository["upsertReferenceFamily"]>[0]) {
      repo.references.push(input);
    },
    async upsertMetricDraft(input: Parameters<SqlFamilyAutoPromotionRepository["upsertMetricDraft"]>[0]) {
      repo.metrics.push(input);
    },
    async verifyFamilies() {
      return {
        summary: {
          templateDraftFound: repo.templates.length,
          referenceFamilyFound: repo.references.length,
          metricDraftFound: repo.metrics.length,
          failedCount: 0,
        },
        failures: [],
      };
    },
  };
  return repo;
}

function fakeQueryClient() {
  return {
    async query(options: { sql: string; maxRows?: number }): Promise<ErpSqlQueryResult> {
      if (options.sql.includes("INFORMATION_SCHEMA.COLUMNS")) return informationSchemaResult(options.sql);
      return { fields: [], rows: [], rowCount: 0 };
    },
  };
}

function informationSchemaResult(sql: string): ErpSqlQueryResult {
  const schemaName = /TABLE_SCHEMA = '([^']+)'/u.exec(sql)?.[1] ?? "";
  const tableName = /TABLE_NAME = '([^']+)'/u.exec(sql)?.[1] ?? "";
  const columns = TABLE_COLUMNS[`${schemaName}.${tableName}`] ?? [];
  return {
    fields: ["COLUMN_NAME", "DATA_TYPE"],
    rows: columns.map((column) => [column, "nvarchar"]),
    rowCount: columns.length,
  };
}

async function fixtureDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sql-family-auto-promotion-"));
  await fs.writeFile(path.join(dir, "classification.json"), JSON.stringify({ families: BATCH2.map((familyId) => ({ familyId })) }), "utf8");
  await fs.writeFile(path.join(dir, "samples.json"), JSON.stringify({ businessFamilies: BATCH2.map(makeFamily) }), "utf8");
  return dir;
}

function makeFamily(familyId: string) {
  const meta = FAMILY_META[familyId] ?? { reportNames: [familyId], datasetNames: ["ds1"], moduleGuess: "unknown", coreTables: ["Erp.Part"], coreJoins: [], params: [] };
  return {
    familyId,
    ...meta,
    representativeDatasetId: 1,
    representativeSql: "SELECT Company FROM Erp.Part",
    sampleDatasetIds: [1, 2],
    hasFanruanMacroCount: 1,
    hasNonSelectRiskCount: 0,
    hasHardcodedCompanyCount: 1,
  };
}

const FAMILY_META: Record<string, { reportNames: string[]; datasetNames: string[]; moduleGuess: string; coreTables: string[]; coreJoins: string[]; params: string[] }> = {
  family_027: { reportNames: ["库存查询"], datasetNames: ["仓库库存"], moduleGuess: "inventory", coreTables: ["Erp.Part", "Erp.PartWhse", "Erp.PartBin", "Erp.Warehse", "Erp.WhseBin"], coreJoins: [], params: ["物料编号"] },
  family_014: { reportNames: ["部门班组分析表"], datasetNames: ["资源群组"], moduleGuess: "production", coreTables: ["Erp.JCDept", "Erp.ResourceGroup"], coreJoins: [], params: ["部门"] },
  family_038: { reportNames: ["工序"], datasetNames: ["工序"], moduleGuess: "production", coreTables: ["Erp.OpMaster"], coreJoins: [], params: [] },
  family_086: { reportNames: ["研发工单BOM完整性查询"], datasetNames: ["ds1"], moduleGuess: "production", coreTables: ["Erp.JobHead", "Erp.JobAsmbl", "Erp.JobMtl"], coreJoins: [], params: ["工单编号"] },
  family_089: { reportNames: ["呆滞库存"], datasetNames: ["各仓库"], moduleGuess: "inventory", coreTables: ["Erp.PartBin", "Erp.Part", "Erp.PartWhse"], coreJoins: [], params: ["物料编号"] },
  family_092: { reportNames: ["报工明细"], datasetNames: ["工序"], moduleGuess: "production", coreTables: ["Erp.ResourceGroup"], coreJoins: [], params: [] },
  family_031: { reportNames: ["PUB.JobOper 工序进度"], datasetNames: ["joboper"], moduleGuess: "production", coreTables: ["PUB.JobOper"], coreJoins: [], params: ["jobnum"] },
  family_006: { reportNames: ["BOM / ECO"], datasetNames: ["ECO"], moduleGuess: "engineering", coreTables: ["PUB.ECOMtl", "PUB.ECORev", "PUB.Part"], coreJoins: [], params: ["partnum"] },
  family_008: { reportNames: ["产品报价"], datasetNames: ["ds1"], moduleGuess: "quotation", coreTables: ["JCJDY.dbo.ProductQuotationDetail"], coreJoins: [], params: ["ContractNo"] },
  family_080: { reportNames: ["产品配置"], datasetNames: ["ds2"], moduleGuess: "quotation", coreTables: ["JCJDY.dbo.ProductQuotation"], coreJoins: [], params: ["ContractNo"] },
};

const TABLE_COLUMNS: Record<string, string[]> = {
  "Erp.Part": ["Company", "PartNum", "PartDescription", "ProdCode"],
  "Erp.PartWhse": ["Company", "PartNum", "WarehouseCode", "OnHandQty", "SafetyQty"],
  "Erp.PartBin": ["Company", "PartNum", "WarehouseCode", "BinNum", "LotNum", "OnhandQty", "OnHandQty"],
  "Erp.Warehse": ["Company", "WarehouseCode", "Description", "Name"],
  "Erp.WhseBin": ["Company", "WarehouseCode", "BinNum", "Description"],
  "Erp.JCDept": ["Company", "JCDept", "Description"],
  "Erp.ResourceGroup": ["Company", "JCDept", "ResourceGrpID", "Description"],
  "Erp.OpMaster": ["Company", "OpCode", "OpDesc"],
  "Erp.JobHead": ["Company", "JobNum", "PartNum", "PartDescription", "ProjectID"],
  "Erp.JobAsmbl": ["Company", "JobNum", "AssemblySeq", "PartNum"],
  "Erp.JobMtl": ["Company", "JobNum", "AssemblySeq", "MtlSeq", "PartNum", "Description", "RequiredQty", "IssuedQty"],
};
