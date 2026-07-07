import assert from "node:assert/strict";
import test from "node:test";
import { buildSqlDatasetReferenceAuditReport } from "../../src/modules/erpSqlAgent/templates/scripts/auditSqlDatasetReferenceIndex.js";
import type { DatasetReferenceSearchRow } from "../../src/modules/erpSqlAgent/templates/service/SqlDatasetReferenceSearch.js";

test("SQL dataset reference audit reports coverage, gaps, metrics, and smoke matches", () => {
  const report = buildSqlDatasetReferenceAuditReport([
    row({
      datasetId: 1n,
      familyId: "family_finance",
      questionText: "查询收入税额",
      sqlText: "SELECT InvoiceAmt, TaxAmt FROM Erp.InvcHead",
      tables: ["Erp.InvcHead"],
      fields: ["InvoiceAmt", "TaxAmt"],
      metrics: ["收入", "税额"],
      businessScenario: "财务收入统计",
      isFinance: true,
      verified: true,
      embeddingVectorJson: [1, 0],
      embeddingModel: "text-embedding-3-small",
    }),
    row({
      datasetId: 2n,
      familyId: "unclassified",
      questionText: "查库存物料",
      sqlText: "SELECT PartNum FROM Erp.PartBin",
      tables: ["Erp.PartBin"],
      fields: ["PartNum"],
      metrics: [],
      businessScenario: "库存查询",
      embeddingVectorJson: [0, 1],
      embeddingModel: "text-embedding-3-small",
    }),
    row({
      datasetId: 3n,
      familyId: "family_cost",
      questionText: "查询成本和毛利",
      sqlText: "SELECT Cost, Profit FROM Erp.TranGLC",
      tables: ["Erp.TranGLC"],
      fields: ["Cost", "Profit"],
      metrics: ["成本", "毛利"],
      businessScenario: "财务成本毛利",
      isFinance: true,
      embeddingVectorJson: [1, 0],
      embeddingModel: "text-embedding-3-small",
    }),
    row({
      datasetId: 4n,
      familyId: "family_ar",
      questionText: "查询应收实收退款",
      sqlText: "SELECT InvoiceAmt, PaidAmt, RefundAmt FROM Erp.InvcHead",
      tables: ["Erp.InvcHead"],
      fields: ["InvoiceAmt", "PaidAmt", "RefundAmt"],
      metrics: ["应收", "实收", "退款"],
      businessScenario: "财务应收收款退款",
      isFinance: true,
      embeddingVectorJson: [1, 0],
      embeddingModel: "text-embedding-3-small",
    }),
    row({
      datasetId: 5n,
      familyId: "family_purchase",
      questionText: "查询采购到货",
      sqlText: "SELECT PONum, ReceiptDate FROM Erp.RcvDtl",
      tables: ["Erp.RcvDtl"],
      fields: ["PONum", "ReceiptDate"],
      metrics: [],
      businessScenario: "采购到货",
      embeddingVectorJson: [0, 1],
      embeddingModel: "text-embedding-3-small",
    }),
  ], 5, { queryVectors: new Map([["查本月收入和税额", [1, 0]]]) });

  assert.equal(report.summary.datasetCount, 5);
  assert.equal(report.summary.indexCount, 5);
  assert.equal(report.summary.missingIndexCount, 0);
  assert.equal(report.summary.financeCount, 3);
  assert.equal(report.summary.verifiedCount, 1);
  assert.equal(report.summary.metricTaggedCount, 3);
  assert.equal(report.summary.smokeGapCount, 0);
  assert.equal(report.summary.embeddingVectorCount, 5);
  assert.equal(report.summary.embeddingCoverageRatio, 1);
  assert.equal(report.embeddingModelCounts["text-embedding-3-small"], 5);
  assert.equal(report.embeddingDimCounts["2"], 5);
  assert.equal(report.fieldGaps.questionText, 0);
  assert.equal(report.fieldGaps.timeScope, 5);
  assert.equal(report.metricCounts["收入"], 1);
  assert(report.smokeQueries.some((item) => item.question.includes("收入") && item.topResults[0]?.datasetId === "1"));
  assert(report.smokeQueries.some((item) => item.topResults.some((result) => result.matchedSignals.some((signal) => signal.startsWith("vector:")))));
});

test("SQL dataset reference audit reports smoke gaps when retrieval has no matches", () => {
  const report = buildSqlDatasetReferenceAuditReport([], 0);

  assert.equal(report.summary.smokeGapCount, report.smokeQueries.length);
});

function row(input: Partial<DatasetReferenceSearchRow>): DatasetReferenceSearchRow {
  return {
    datasetId: 1n,
    familyId: "unclassified",
    module: null,
    intent: null,
    reportName: null,
    datasetName: null,
    questionText: "",
    sqlText: "",
    tables: [],
    fields: [],
    metrics: [],
    params: [],
    riskFlags: [],
    keywords: [],
    summary: "",
    businessDescription: "",
    timeScope: "",
    businessScenario: "",
    isFinance: false,
    verified: false,
    normalizedSqlPreview: "",
    ...input,
  };
}
