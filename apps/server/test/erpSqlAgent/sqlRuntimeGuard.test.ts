import assert from "node:assert/strict";
import test from "node:test";
import type { SqlGeneratorGuard } from "../../src/modules/erpSqlAgent/generator/index.js";
import { AnalysisPlanCoverageService, SqlRuntimeGuardService } from "../../src/modules/erpSqlAgent/runtimeGuard/index.js";
import type { SqlGuardOptions, SqlGuardResult } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";

class PassingSchemaGuard implements SqlGeneratorGuard {
  readonly sql: string[] = [];

  async validate(sql: string, _options?: SqlGuardOptions): Promise<SqlGuardResult> {
    this.sql.push(sql);
    return {
      valid: true,
      errors: [],
      warnings: [],
      normalizedSql: sql,
      referencedTables: ["Erp.OrderHed"],
      referencedFields: ["Company"],
    };
  }
}

test("runtime guard rejects a schema-valid candidate from the wrong semantic family", async () => {
  const schemaGuard = new PassingSchemaGuard();
  const guard = new SqlRuntimeGuardService(schemaGuard);
  const sql = "SELECT TOP 100 Company FROM Erp.OrderHed";

  const result = await guard.validate({
    question: "查询物料 A123 的库存",
    sql,
    source: "template",
    references: [{
      familyId: "family_016",
      businessDescription: "销售订单明细",
      coreTables: ["Erp.OrderHed"],
      joins: [],
      sourceType: "template",
    }],
  });

  assert.equal(schemaGuard.sql.length, 1);
  assert.equal(result.valid, false);
  assert.equal(result.sql, "");
  assert.equal(result.candidateSql, sql);
  assert.equal(result.semanticResult.status, "semantic_mismatch");
  assert.deepEqual(result.semanticResult.expectedFamilyIds.sort(), ["family_027", "family_050"]);
  assert(result.guardResult.errors.some((error) => error.startsWith("semantic_mismatch:")));
});

test("runtime guard treats retrieval references as context, not actual SQL family evidence", async () => {
  const guard = new SqlRuntimeGuardService(new PassingSchemaGuard());
  const sql = "SELECT TOP 100 Company FROM Erp.OrderHed";

  const result = await guard.validate({
    question: "查询物料 A123 的库存",
    sql,
    source: "llm",
    references: [{
      familyId: "family_027",
      businessDescription: "库存参考",
      coreTables: ["Erp.PartWhse"],
      joins: [],
      sourceType: "dataset",
    }],
  });

  assert.equal(result.valid, false);
  assert.equal(result.sql, "");
  assert.equal(result.semanticResult.status, "semantic_mismatch");
  assert(result.semanticResult.actualFamilyIds.includes("family_016"));
  assert(result.semanticResult.actualFamilyIds.includes("family_100"));
});

test("runtime guard keeps a semantically matching low-confidence estimate distinct from mismatch", async () => {
  const guard = new SqlRuntimeGuardService(new PassingSchemaGuard());

  const result = await guard.validate({
    question: "产品毛利大概是多少",
    sql: "SELECT TOP 100 Company, PartNum AS product, SUM(DocOrderAmt) AS gross_margin_rate FROM Erp.OrderHed GROUP BY Company, PartNum",
    source: "llm",
    references: [{
      familyId: "family_100",
      businessDescription: "订单毛利参考",
      coreTables: ["Erp.OrderHed"],
      joins: [],
      sourceType: "dataset",
    }],
    analysisPlan: {
      mode: "decision_support",
      grain: ["product"],
      metrics: ["gross_margin_rate"],
      filters: [],
      dimensions: ["product"],
      orderBy: [],
    },
    financeMode: "estimate",
    lowConfidence: true,
  });

  assert.equal(result.valid, true);
  assert.equal(result.semanticResult.status, "estimate");
  assert.equal(result.coverageResult.valid, true);
  assert.deepEqual(result.semanticResult.expectedFamilyIds, ["family_100"]);
  assert(result.semanticResult.actualFamilyIds.includes("family_100"));
});

test("runtime guard rejects SQL that omits a required order filter", async () => {
  const guard = new SqlRuntimeGuardService(new PassingSchemaGuard());
  const result = await guard.validate({
    question: "查询订单 226867",
    sql: "SELECT TOP 100 Company, OrderNum FROM Erp.OrderHed",
    source: "template",
    references: [{ familyId: "family_016", businessDescription: "销售订单明细", coreTables: ["Erp.OrderHed"], joins: [], sourceType: "template" }],
    analysisPlan: {
      mode: "strict",
      grain: ["order"],
      metrics: [],
      filters: [],
      dimensions: ["order"],
      orderBy: [],
      dimensionFilters: { order: "226867" },
    },
  });

  assert.equal(result.valid, false);
  assert.match(result.guardResult.errors.join(" "), /required filter.*order/i);
});

test("analysis plan coverage reports every missing contract category", () => {
  const result = new AnalysisPlanCoverageService().validate(
    "SELECT TOP 100 Company FROM Erp.OrderHed",
    {
      mode: "strict",
      grain: ["product"],
      metrics: ["order_amount"],
      filters: [{ metric: "order_amount", op: "rank_high" }],
      dimensions: ["product"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      dimensionFilters: { customer: "ACME" },
      timeRange: { kind: "current_year" },
      comparison: { kind: "year_over_year" },
      limit: 5,
    },
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.missing.metrics, ["order_amount"]);
  assert.deepEqual(result.missing.dimensions, ["product"]);
  assert.deepEqual(result.missing.filters, ["customer=ACME", "order_amount:rank_high"]);
  assert.deepEqual(result.missing.time, ["current_year"]);
  assert.deepEqual(result.missing.comparison, ["year_over_year"]);
  assert.deepEqual(result.missing.sorting, ["order_amount:DESC"]);
  assert.deepEqual(result.missing.limit, ["5"]);
});

test("analysis plan coverage accepts AST-proven projection, predicate, window, sort and limit", () => {
  const result = new AnalysisPlanCoverageService().validate(
    `SELECT TOP 5 Company, PartNum AS product,
      SUM(DocOrderAmt) AS order_amount,
      SUM(DocOrderAmt) AS order_amount_comparison
    FROM Erp.OrderHed
    WHERE CustomerName = 'ACME' AND OrderDate >= '20260101'
    GROUP BY Company, PartNum
    ORDER BY order_amount DESC`,
    {
      mode: "strict",
      grain: ["product"],
      metrics: ["order_amount"],
      filters: [{ metric: "order_amount", op: "rank_high" }],
      dimensions: ["product"],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      dimensionFilters: { customer: "ACME" },
      timeRange: { kind: "current_year" },
      comparison: { kind: "year_over_year" },
      limit: 5,
    },
  );

  assert.equal(result.valid, true, result.errors.join("; "));
});
