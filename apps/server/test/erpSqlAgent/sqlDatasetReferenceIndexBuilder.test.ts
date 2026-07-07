import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexRow, buildSqlDatasetReferenceIndexReport, type DatasetRow, type FamilyRow } from "../../src/modules/erpSqlAgent/templates/scripts/buildSqlDatasetReferenceIndex.js";

test("SQL dataset reference index row stores searchable SQL metadata", () => {
  const row = buildIndexRow(dataset({
    rawSql: `
      SELECT h.Company, h.InvoiceDate, SUM(h.InvoiceAmt) AS Revenue, SUM(h.TaxAmt) AS TaxAmt
      FROM Erp.InvcHead h
      JOIN Erp.Customer c ON c.Company = h.Company AND c.CustNum = h.CustNum
      WHERE h.InvoiceDate >= DATEADD(month, -1, GETDATE())
      GROUP BY h.Company, h.InvoiceDate
    `,
    reportName: "财务应收收入税额报表",
    datasetName: "本月收入",
  }), family(), new Set(["1"]));

  assert.equal(row.questionText.includes("财务应收收入"), true);
  assert.equal(row.sqlText.includes("InvoiceAmt"), true);
  assert.equal(row.familyId, "family_finance");
  assert.deepEqual(row.tables, ["Erp.InvcHead", "Erp.Customer"]);
  assert(row.fields.includes("InvoiceAmt"));
  assert(row.metrics.includes("收入"));
  assert(row.metrics.includes("应收"));
  assert(row.metrics.includes("税额"));
  assert(row.timeScope.includes("relative_date"));
  assert(row.timeScope.includes("InvoiceDate"));
  assert.equal(row.businessScenario, "财务应收收入和税额统计");
  assert.equal(row.isFinance, true);
  assert.equal(row.verified, true);
});

test("SQL dataset reference verified flag is not inferred from family alone", () => {
  const row = buildIndexRow(dataset({
    rawSql: "SELECT Company, InvoiceAmt FROM Erp.InvcHead",
    reportName: "收入报表",
  }), family());

  assert.equal(row.familyId, "family_finance");
  assert.equal(row.verified, false);
});

test("SQL dataset reference extracts params from SQL text and FineReport macros", () => {
  const row = buildIndexRow(dataset({
    rawSql: `
      SELECT Company, PartNum
      FROM Erp.Part
      WHERE Company = @companyScope
        AND PartNum = '\${partNum}'
        AND ${"$"}P{warehouseCode} IS NOT NULL
    `,
    dynamicParams: ["importedDate"],
  }), null);

  assert.deepEqual(row.params, ["companyScope", "importedDate", "partNum", "warehouseCode"]);
  assert(row.fields.includes("Company"));
  assert(row.fields.includes("PartNum"));
  assert(!row.fields.includes("companyScope"));
  assert(!row.fields.includes("partNum"));
  assert(!row.fields.includes("warehouseCode"));
  assert(row.keywords.includes("warehouseCode"));
});

test("SQL dataset reference extracts multi-part table names", () => {
  const row = buildIndexRow(dataset({
    rawSql: `
      SELECT q.Company, d.ContractNo
      FROM JCJDY.dbo.ProductQuotation q
      JOIN [JCJDY].[dbo].[ProductQuotationDetail] d ON d.QuoteID = q.ID
    `,
  }), null);

  assert.deepEqual(row.tables, ["JCJDY.dbo.ProductQuotation", "JCJDY.dbo.ProductQuotationDetail"]);
});

test("SQL dataset reference includes template questions in question text", () => {
  const row = buildIndexRow(dataset({
    rawSql: "SELECT Company, PartNum FROM Erp.Part",
    reportName: "库存报表",
  }), null, new Set(), ["查询物料库存", "查物料库存"]);

  assert(row.questionText.startsWith("查询物料库存 查物料库存"));
  assert(row.keywords.includes("查询物料库存"));
});

test("SQL dataset reference falls back to table-based question text", () => {
  const row = buildIndexRow(dataset({
    rawSql: "SELECT PartNum FROM Erp.PartBin",
  }), null);

  assert.equal(row.questionText, "查询Erp.PartBin");
  assert.equal(row.module, "inventory");
  assert.equal(row.intent, "detail");
  assert.equal(row.timeScope, "未识别时间口径");
  assert.equal(row.businessScenario, "历史SQL参考: Erp.PartBin");
});

test("SQL dataset reference infers aggregate intent without family", () => {
  const row = buildIndexRow(dataset({
    rawSql: "SELECT Company, SUM(InvoiceAmt) AS Amount FROM Erp.InvcHead GROUP BY Company",
  }), null);

  assert.equal(row.module, "finance");
  assert.equal(row.intent, "aggregate");
});

test("SQL dataset reference marks inline SQL when no source table exists", () => {
  const row = buildIndexRow(dataset({
    rawSql: "SELECT 673 数量, '中国' 国家 UNION SELECT 1001 数量, '泰国' 国家",
  }), null);

  assert.deepEqual(row.tables, ["inline_values"]);
  assert(row.fields.includes("数量"));
  assert(row.fields.includes("国家"));
});

test("SQL dataset reference index build report includes audit summary", () => {
  const indexed = buildIndexRow(dataset({
    rawSql: "SELECT Company, InvoiceAmt FROM Erp.InvcHead",
    reportName: "收入报表",
  }), family());
  const missingQuestion = buildIndexRow(dataset({
    datasetId: 2n,
    rawSql: "SELECT PartNum FROM Erp.PartBin",
  }), null);
  const report = buildSqlDatasetReferenceIndexReport([indexed, missingQuestion], 3, false);

  assert.equal(report.mode, "dry-run");
  assert.equal(report.audit.summary.indexCount, 2);
  assert.equal(report.audit.summary.missingIndexCount, 1);
  assert.equal(report.audit.fieldGaps.questionText, 0);
  assert.equal(report.audit.fieldGaps.timeScope, 0);
  assert.equal(report.audit.fieldGaps.businessScenario, 0);
  assert.equal(report.audit.metricCounts["收入"], 1);
  assert.equal(report.familyLinkedCount, 1);
});

function dataset(input: Partial<DatasetRow>): DatasetRow {
  return {
    datasetId: 1n,
    sqlHash: "hash",
    rawSql: "SELECT 1",
    datasetName: null,
    dynamicParams: [],
    riskFlags: [],
    reportName: null,
    ...input,
  };
}

function family(input: Partial<FamilyRow> = {}): FamilyRow {
  return {
    familyId: "family_finance",
    module: "finance",
    intent: "aggregate",
    businessDescription: "财务应收收入和税额统计",
    representativeDatasetId: 1n,
    sampleDatasetIds: ["1"],
    ...input,
  };
}
