import assert from "node:assert/strict";
import test from "node:test";
import { extractDatasets } from "../../src/modules/erpSqlAgent/templates/service/FineReportSqlExtractor.js";
import { analyzeDataset, SqlTemplateAnalysisService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateAnalysisService.js";
import { SqlTemplateExecutionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import { analyzeFamilyItem, normalizeSqlForFamily, SqlTemplateFamilySampler } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateFamilySampler.js";
import { SqlTemplateGuardService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateGuardService.js";
import { SqlTemplatePromotionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplatePromotionService.js";

test("FineReport extraction returns raw datasets only", () => {
  const datasets = extractDatasets(`
    <TableData name="ds1"><Connection><DatabaseName><![CDATA[JDBC2]]></DatabaseName></Connection>
    <Query><![CDATA[SELECT * FROM Erp.Part WHERE PartNum='${"${partNum}"}']]></Query></TableData>
    <Formula><![CDATA[SELECT Company FROM Erp.Part]]></Formula>
  `);

  assert.equal(datasets.length, 2);
  assert.equal(datasets[0]?.datasetType, "query");
  assert.equal(datasets[0]?.connectionName, "JDBC2");
  assert.deepEqual(datasets[0]?.dynamicParams, ["partNum"]);
  assert(datasets[0]?.riskFlags.includes("finereport_dynamic_param"));
  assert.equal(datasets[1]?.datasetType, "formula_sql");
});

test("promotion creates a draft template and keeps approval blocked", async () => {
  const created: unknown[] = [];
  const service = new SqlTemplatePromotionService({
    async findDataset() {
      return {
        id: 1n,
        datasetName: "库存",
        rawSql: "SELECT TOP 100 Company, PartNum FROM Erp.Part WHERE PartNum='${partNum}'",
        sqlHash: "hash",
        dynamicParams: ["partNum"],
        reportFile: { reportName: "库存报表" },
      } as never;
    },
    async createTemplateDraft(input) {
      created.push(input);
      return { id: 10n, approvalStatus: "draft", approved: false, guardPassed: false } as never;
    },
  }, {
    async validate() {
      return { valid: true, errors: [], warnings: [], referencedTables: ["Erp.Part"], referencedFields: ["Company", "PartNum"] };
    },
  });

  const template = await service.promote({ datasetId: 1n, intent: "inventory_onhand_by_part", module: "inventory" });

  assert.equal(template.approvalStatus, "draft");
  assert.equal((created[0] as { sqlTemplate: string }).sqlTemplate.includes("@partNum"), true);
  assert.equal((created[0] as { requiredParams: Record<string, unknown> }).requiredParams.partNum !== undefined, true);
});

test("template guard rejects FineReport and concatenated parameters", async () => {
  const service = new SqlTemplateGuardService({
    async validate(sql) {
      return {
        valid: /^\s*select\b/iu.test(sql),
        errors: /^\s*select\b/iu.test(sql) ? [] : ["Only SELECT"],
        warnings: [],
        referencedTables: [],
        referencedFields: [],
      };
    },
  });

  const fineReport = await service.validate("SELECT TOP 100 Company FROM Erp.Part WHERE PartNum='${partNum}'", {});
  const concat = await service.validate("SELECT TOP 100 Company FROM Erp.Part WHERE PartNum = '' + @partNum + ''", { partNum: {} });
  const missing = await service.validate("SELECT TOP 100 Company FROM Erp.Part", { partNum: {} });
  const ok = await service.validate("SELECT TOP 100 Company FROM Erp.Part WHERE PartNum = @partNum", { partNum: {} });

  assert.equal(fineReport.guardPassed, false);
  assert.equal(concat.guardPassed, false);
  assert.equal(missing.guardPassed, false);
  assert.equal(ok.guardPassed, true);
});

test("template execution blocks unsafe templates and binds approved params", async () => {
  const calls: unknown[] = [];
  const uses: boolean[] = [];
  const template = {
    id: 1n,
    approved: true,
    approvalStatus: "approved",
    guardPassed: true,
    sqlTemplate: "SELECT TOP 100 Company FROM Erp.Part WHERE PartNum = @partNum",
    requiredParams: { partNum: { type: "string" } },
    optionalParams: {},
  };
  const service = new SqlTemplateExecutionService({
    async findTemplate() {
      return template as never;
    },
    async recordUse(_templateId, success) {
      uses.push(success);
    },
  }, {
    async query(options) {
      calls.push(options);
      return { fields: ["Company"], rows: [["jctimes"]], rowCount: 1, truncated: false };
    },
  });

  const missing = await service.execute({ templateId: 1n, params: {} });
  const ok = await service.execute({ templateId: 1n, params: { partNum: "A123" } });

  assert.equal(missing.executed, false);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { params: unknown[] }).params, ["A123"]);
  assert.equal(ok.executed, true);
  assert.deepEqual(uses, [true]);
});

test("SQL template analysis scores and recommends stable SELECT candidates", async () => {
  const row = makeAnalysisRow(`
    SELECT TOP 100 jh.Company, jh.JobNum, jo.OprSeq
    FROM Erp.JobHead jh
    INNER JOIN Erp.JobOper jo ON jo.Company = jh.Company AND jo.JobNum = jh.JobNum
    WHERE jh.Company = @company AND jh.JobNum = @jobNum
  `);

  const analyzed = analyzeDataset(row);

  assert.equal(analyzed.module, "production");
  assert.equal(analyzed.sqlType, "select");
  assert.equal(analyzed.qualityGrade, "A");
  assert.equal(analyzed.joins[0]?.normalizedCondition, "Company + JobNum");
});

test("SQL template analysis report includes risks, candidates, and suggestions", async () => {
  const service = new SqlTemplateAnalysisService({
    async findDatasetsForAnalysis() {
      return [
        makeAnalysisRow(`
          SELECT TOP 100 jh.Company, jh.JobNum, jo.OprSeq
          FROM Erp.JobHead jh
          INNER JOIN Erp.JobOper jo ON jo.Company = jh.Company AND jo.JobNum = jh.JobNum
          WHERE jh.Company = @company AND jh.JobNum = @jobNum
        `),
        makeAnalysisRow("DELETE FROM Erp.JobHead WHERE Company='jytimes'", 2n),
      ];
    },
  });

  const report = await service.analyze({ sourceType: "finereport_cpt" });

  assert.equal(report.summary.totalDatasets, 2);
  assert.equal(report.summary.nonSelectRiskCount, 1);
  assert.equal(report.moduleStats[0]?.module, "production");
  assert.equal(report.templateCandidates.length, 1);
  assert(report.riskSamples.some((sample) => sample.issues.includes("non_select_keyword")));
  assert(report.knowledgeBaseSuggestions.joinRules.length >= 1);
});

test("SQL family sampler normalizes literals, tables, joins, and macro params", () => {
  const normalized = normalizeSqlForFamily("SELECT TOP 100 * FROM ERP.PARTTRAN WHERE Company='jctimes' AND TranDate='2026-01-02' AND Qty > 10");
  const item = analyzeFamilyItem(makeAnalysisRow(`
    SELECT TOP 100 a.Company, a.PartNum
    FROM ERP.PARTTRAN a
    INNER JOIN Erp.Part b ON b.Company = a.Company AND b.PartNum = a.PartNum
    WHERE ${"${ if(len(date1) == 0,\"\",\" and a.TranDate >= '\"+ date1 +\"' \") }"}
  `));

  assert(normalized.includes("top ?number"));
  assert(normalized.includes("?date"));
  assert(normalized.includes("?number"));
  assert.deepEqual(item.coreTables, ["Erp.Part", "Erp.PartTran"]);
  assert.equal(item.joins[0], "Erp.PartTran -> Erp.Part ON Company + PartNum");
  assert(item.params.includes("date1"));
});

test("SQL family sampler groups by core table family", async () => {
  const service = new SqlTemplateFamilySampler({
    async findDatasetsForAnalysis() {
      return [
        makeAnalysisRow("SELECT TOP 100 * FROM Erp.POHeader h JOIN Erp.PODetail d ON d.Company=h.Company AND d.PONum=h.PONum WHERE h.PONum=1001", 1n),
        makeAnalysisRow("SELECT TOP 100 h.Company,h.PONum FROM ERP.POHEADER h JOIN ERP.PODETAIL d ON d.Company=h.Company AND d.PONum=h.PONum WHERE h.PONum=2002", 2n),
      ];
    },
  });

  const report = await service.sample({ sourceType: "finereport_cpt" });

  assert.equal(report.summary.totalDatasets, 2);
  assert.equal(report.summary.outputFamilyCount, 1);
  assert.equal(report.families[0]?.moduleGuess, "purchase");
  assert.equal(report.families[0]?.datasetCount, 2);
  assert.deepEqual(report.families[0]?.coreTables, ["Erp.PODetail", "Erp.POHeader"]);
});

test("SQL family sampler business-only separates demo and business families", async () => {
  const service = new SqlTemplateFamilySampler({
    async findDatasetsForAnalysis() {
      return [
        makeAnalysisRow("SELECT * FROM 销量", 1n, "图表示例.cpt"),
        makeAnalysisRow("SELECT TOP 100 h.Company,h.PONum FROM ERP.POHEADER h JOIN ERP.PODETAIL d ON d.Company=h.Company AND d.PONum=h.PONum", 2n, "采购订单明细.cpt"),
        makeAnalysisRow("SELECT TOP 100 * FROM Erp.Carsales", 3n, "销售demo.cpt"),
      ];
    },
  });

  const report = await service.sample({ sourceType: "finereport_cpt", businessOnly: true });

  assert.equal(report.businessFamilies.length, 1);
  assert.equal(report.businessFamilies[0]?.recommendedUse, "template_candidate");
  assert.equal(report.businessFamilies[0]?.permissionDomainGuess, "purchase");
  assert(report.demoFilteredFamilies.some((family) => family.representativeSql.includes("销量")));
  assert(report.needsReviewFamilies.some((family) => family.coreTables.includes("Erp.Carsales")));
});

function makeAnalysisRow(rawSql: string, id = 1n, reportName = "report.cpt") {
  return {
    id,
    datasetName: "maindata",
    rawSql,
    sqlHash: `hash-${id.toString()}`,
    dynamicParams: [],
    riskFlags: [],
    reportFile: {
      reportName,
      relativePath: reportName,
    },
  };
}
