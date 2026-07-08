import assert from "node:assert/strict";
import test from "node:test";
import { buildSqlReferenceSearchReport } from "../../src/modules/erpSqlAgent/templates/scripts/searchSqlDatasetReferences.js";

test("SQL reference search report exposes top dataset metadata without full SQL text", () => {
  const report = buildSqlReferenceSearchReport("查本月收入和税额", [{
    datasetId: "1",
    familyId: "family_finance",
    businessDescription: "财务收入统计",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    exampleSql: "SELECT Company, SUM(InvoiceAmt) AS Amount FROM Erp.InvcHead GROUP BY Company",
    reportName: "收入报表",
    datasetName: "收入",
    fields: ["Company", "InvoiceAmt", "TaxAmt"],
    metrics: ["收入", "税额"],
    questionText: "查询收入税额",
    timeScope: "InvoiceDate",
    businessScenario: "财务收入统计",
    isFinance: true,
    verified: true,
    sourceType: "dataset",
    score: 0.9,
    matchedSignals: ["semantic:收入", "metric:收入", "schema:InvoiceAmt", "family:family_finance"],
  }], [{
    familyId: "family_finance",
    businessDescription: "财务 family",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    score: 0.5,
    matchedSignals: ["family"],
  }]);

  assert.equal(report.kind, "sql_reference_search");
  assert.equal(report.datasetReferences.length, 1);
  assert.equal(report.datasetReferences[0].datasetId, "1");
  assert.deepEqual(report.datasetReferences[0].metrics, ["收入", "税额"]);
  assert(report.datasetReferences[0].matchedSignals.includes("metric:收入"));
  assert.equal("sqlText" in report.datasetReferences[0], false);
  assert(report.datasetReferences[0].sqlPreview?.includes("InvoiceAmt"));
  assert.equal(report.familyReferences[0].familyId, "family_finance");
});
