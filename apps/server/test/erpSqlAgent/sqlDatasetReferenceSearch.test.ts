import assert from "node:assert/strict";
import test from "node:test";
import { runFindSqlReferenceTool } from "../../src/ai/mastra/tools/erpSql/toolchain.tools.js";
import { rerankDatasetReferenceWithVector, scoreDatasetReference, type DatasetReferenceSearchRow } from "../../src/modules/erpSqlAgent/templates/service/SqlDatasetReferenceSearch.js";
import { sqlTemplateRepository } from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";

test("dataset reference scoring prefers matching finance SQL", () => {
  const finance = row({
    module: "finance",
    familyId: "family_finance",
    reportName: "财务应收收入统计",
    fields: ["InvoiceAmt", "TaxAmt", "DueDate"],
    metrics: ["收入", "应收", "税额"],
    keywords: ["收入", "应收", "发票"],
    isFinance: true,
  });
  const inventory = row({
    module: "inventory",
    familyId: "family_inventory",
    reportName: "库存明细",
    fields: ["PartNum", "OnHandQty"],
    keywords: ["库存", "物料"],
  });

  const input = { question: "查本月财务应收收入和税额", module: "finance", intent: "aggregate" };

  assert(scoreDatasetReference(finance, input).score > scoreDatasetReference(inventory, input).score);
  assert(scoreDatasetReference(finance, input).matchedSignals.includes("finance"));
  assert(scoreDatasetReference(finance, input).matchedSignals.includes("metric:收入"));
  assert(scoreDatasetReference(finance, input).matchedSignals.includes("module:finance"));
  assert(scoreDatasetReference(finance, input).matchedSignals.includes("family:family_finance"));
  assert(scoreDatasetReference(finance, input).matchedSignals.some((signal) => signal.startsWith("semantic:")));
  assert(scoreDatasetReference(finance, input).matchedSignals.some((signal) => signal.startsWith("schema:")));
});

test("dataset reference scoring can match SQL without family", () => {
  const scored = scoreDatasetReference(row({
    familyId: "unclassified",
    reportName: "供应商采购到货明细",
    tables: ["Erp.POHeader", "Erp.PODetail"],
    fields: ["VendorNum", "PONum"],
    keywords: ["供应商", "采购", "到货"],
  }), { question: "查供应商采购到货", module: "purchase" });

  assert(scored.score > 0);
  assert(scored.matchedSignals.includes("采购"));
  assert(scored.matchedSignals.includes("semantic:采购"));
  assert(scored.matchedSignals.some((signal) => signal.startsWith("schema:")));
});

test("dataset reference vector score can improve rank and falls back without vectors", () => {
  const lowMixed = rerankDatasetReferenceWithVector(0.1, ["mixed"], [1, 0], [1, 0]);
  const highMixed = rerankDatasetReferenceWithVector(0.2, ["mixed"], [0, 1], [1, 0]);
  const fallback = rerankDatasetReferenceWithVector(0.2, ["mixed"], null, [1, 0]);

  assert(lowMixed.score > highMixed.score);
  assert(lowMixed.matchedSignals.some((signal) => signal.startsWith("vector:")));
  assert.deepEqual(fallback, { score: 0.2, matchedSignals: ["mixed"] });
});

test("find SQL reference returns dataset references before family fallback", async () => {
  const originalDataset = sqlTemplateRepository.findDatasetReferenceCandidates;
  const originalFamily = sqlTemplateRepository.findReferenceCandidates;
  try {
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = async () => [{
      datasetId: "42",
      familyId: "family_finance",
      businessDescription: "财务应收收入统计",
      coreTables: ["Erp.InvcHead"],
      joins: [],
      exampleSql: "SELECT Company, SUM(InvoiceAmt) AS Amount FROM Erp.InvcHead GROUP BY Company",
      reportName: "财务报表",
      datasetName: "应收收入",
      fields: ["InvoiceAmt"],
      metrics: ["收入", "应收"],
      questionText: "查询财务应收收入",
      timeScope: "InvoiceDate",
      businessScenario: "财务应收收入统计",
      isFinance: true,
      verified: true,
      sourceType: "dataset",
      score: 0.9,
      matchedSignals: ["finance"],
    }];
    (sqlTemplateRepository as any).findReferenceCandidates = async () => [{
      familyId: "family_finance",
      businessDescription: "财务 family",
      coreTables: ["Erp.InvcHead"],
      joins: [],
      exampleSql: "SELECT Company FROM Erp.InvcHead GROUP BY Company",
      score: 0.6,
      matchedSignals: ["family"],
    }];

    const result = await runFindSqlReferenceTool({ question: "查财务应收收入" });

    assert.equal(result.references.length, 2);
    assert.equal(result.references[0].sourceType, "dataset");
    assert.equal(result.references[0].datasetId, "42");
    assert.equal(result.references[0].sqlPreview, result.references[0].exampleSql);
    assert.deepEqual(result.references[0].metrics, ["收入", "应收"]);
    assert.equal(result.references[0].questionText, "查询财务应收收入");
    assert.equal("sqlText" in result.references[0], false);
    assert.equal(result.references[0].isFinance, true);
    assert.equal(result.references[0].verified, true);
    assert.equal(result.references[1].sourceType, "family");
  } finally {
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = originalDataset;
    (sqlTemplateRepository as any).findReferenceCandidates = originalFamily;
  }
});

test("find SQL reference keeps top ten dataset SQL references", async () => {
  const originalDataset = sqlTemplateRepository.findDatasetReferenceCandidates;
  const originalFamily = sqlTemplateRepository.findReferenceCandidates;
  try {
    let requestedLimit = 0;
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = async (input: { limit?: number }) => {
      requestedLimit = input.limit ?? 0;
      return Array.from({ length: 10 }, (_item, index) => ({
        datasetId: String(index + 1),
        familyId: `family_${index + 1}`,
        businessDescription: `历史 SQL ${index + 1}`,
        coreTables: ["Erp.InvcHead"],
        joins: [],
        exampleSql: `SELECT Company, ${index + 1} AS No FROM Erp.InvcHead`,
        fields: ["Company"],
        metrics: ["收入"],
        questionText: `收入问题 ${index + 1}`,
        timeScope: "InvoiceDate",
        businessScenario: "收入查询",
        isFinance: true,
        verified: true,
        sourceType: "dataset",
        score: 1 - index / 100,
        matchedSignals: ["收入"],
      }));
    };
    (sqlTemplateRepository as any).findReferenceCandidates = async () => [{
      familyId: "family_fallback",
      businessDescription: "family fallback",
      coreTables: ["Erp.InvcHead"],
      joins: [],
      score: 0.1,
      matchedSignals: ["fallback"],
    }];

    const result = await runFindSqlReferenceTool({ question: "查收入" });

    assert.equal(requestedLimit, 10);
    assert.equal(result.references.filter((item) => item.sourceType === "dataset").length, 10);
    assert.equal(result.references[9].datasetId, "10");
    assert.equal(result.references[10].sourceType, "family");
  } finally {
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = originalDataset;
    (sqlTemplateRepository as any).findReferenceCandidates = originalFamily;
  }
});

function row(input: Partial<DatasetReferenceSearchRow>): DatasetReferenceSearchRow {
  return {
    datasetId: 1n,
    familyId: "family_001",
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
