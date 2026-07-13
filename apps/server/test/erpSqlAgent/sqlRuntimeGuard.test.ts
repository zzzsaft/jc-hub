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

test("runtime guard recognizes unfinished operations and supplier overdue delivery before template execution", async () => {
  const guard = new SqlRuntimeGuardService(new PassingSchemaGuard());
  const operation = await guard.validate({
    question: "查工序未完工的工单",
    sql: "SELECT TOP 100 Company FROM Erp.JobOper",
    source: "template",
    references: [{ familyId: "family_031", businessDescription: "工单工序进度", coreTables: ["Erp.JobOper"], joins: [], sourceType: "template" }],
  });
  const supplier = await guard.validate({
    question: "哪些供应商交期已经超了",
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    source: "template",
    references: [{ familyId: "family_062", businessDescription: "采购到货", coreTables: ["Erp.POHeader"], joins: [], sourceType: "template" }],
  });

  assert.equal(operation.semanticResult.status, "exact");
  assert.equal(supplier.semanticResult.status, "exact");
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
    `WITH totals AS (
      SELECT Company, YEAR(OrderDate) AS period, SUM(DocOrderAmt) AS order_amount
      FROM Erp.OrderHed
      WHERE (OrderDate >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1) AND OrderDate < DATEADD(day, 1, CAST(GETDATE() AS date)))
         OR (OrderDate >= DATEADD(year, -1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1)) AND OrderDate < DATEADD(year, -1, DATEADD(day, 1, CAST(GETDATE() AS date))))
      GROUP BY Company, YEAR(OrderDate)
    )
    SELECT TOP 5 current_period.Company,
      current_period.order_amount AS order_amount,
      previous_period.order_amount AS order_amount_comparison,
      current_period.order_amount - previous_period.order_amount AS order_amount_change
    FROM totals current_period
    LEFT JOIN totals previous_period ON previous_period.Company = current_period.Company AND previous_period.period = current_period.period - 1
    WHERE current_period.period = YEAR(GETDATE())
    ORDER BY order_amount DESC`,
    {
      mode: "strict",
      grain: [],
      metrics: ["order_amount"],
      filters: [{ metric: "order_amount", op: "rank_high" }],
      dimensions: [],
      orderBy: [{ metric: "order_amount", direction: "DESC" }],
      timeRange: { kind: "current_year" },
      comparison: { kind: "year_over_year" },
      limit: 5,
    },
  );

  assert.equal(result.valid, true, result.errors.join("; "));
});

test("analysis plan coverage rejects widened order predicates and projection-only predicates", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = {
    mode: "strict" as const,
    grain: ["order"], metrics: [], filters: [], dimensions: ["order"], orderBy: [],
    dimensionFilters: { order: "226867" },
  };
  const sql = (predicate: string) => `SELECT TOP 100 Company, OrderNum AS [order] FROM Erp.OrderHed ${predicate}`;

  assert.equal(service.validate(sql("WHERE OrderNum IN (226867, 226868)"), plan).valid, false);
  assert.equal(service.validate(sql("WHERE OrderNum LIKE '%226867%'"), plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 Company, OrderNum AS [order], CASE WHEN OrderNum = 226867 THEN 1 ELSE 0 END AS flag FROM Erp.OrderHed", plan).valid, false);
  assert.equal(service.validate(sql("WHERE OrderNum IN (226867)"), plan).valid, true);
});

test("analysis plan coverage rejects OR-widened and unrelated-scope predicates", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = {
    mode: "strict" as const, grain: ["order"], metrics: [], filters: [], dimensions: ["order"], orderBy: [],
    dimensionFilters: { order: "226867" },
  };

  assert.equal(service.validate("SELECT TOP 100 Company, OrderNum AS [order] FROM Erp.OrderHed WHERE OrderNum = 226867 OR 1 = 1", plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 Company, OrderNum AS [order] FROM Erp.OrderHed h WHERE EXISTS (SELECT 1 FROM Erp.OrderDtl d WHERE d.OrderNum = 226867)", plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 h.Company, h.OrderNum AS [order] FROM Erp.OrderHed h JOIN Erp.OrderDtl d ON d.OrderNum = h.OrderNum OR d.OrderNum = 226867", plan).valid, false);
});

test("analysis plan coverage rejects time predicates outside predicate roots and wrong windows", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = {
    mode: "strict" as const,
    grain: [], metrics: [], filters: [], dimensions: [], orderBy: [],
    timeRange: { kind: "current_year" as const },
  };

  assert.equal(service.validate("SELECT TOP 100 Company, CASE WHEN OrderDate >= '20260101' THEN 1 ELSE 0 END AS current_year FROM Erp.OrderHed", plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 Company FROM Erp.OrderHed WHERE OrderDate < '20000101'", plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 Company FROM Erp.OrderHed WHERE OrderNum >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1) AND OrderNum < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))", plan).valid, false);
  assert.equal(service.validate("SELECT TOP 100 Company FROM Erp.OrderHed WHERE OrderDate >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1) AND OrderDate < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))", plan).valid, true);
});

test("analysis plan coverage requires real comparison windows and metric sources", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = {
    mode: "strict" as const,
    grain: [], metrics: ["order_amount"], filters: [], dimensions: [], orderBy: [],
    timeRange: { kind: "current_year" as const }, comparison: { kind: "year_over_year" as const },
  };

  const constantComparison = `SELECT TOP 100 Company, SUM(DocOrderAmt) AS order_amount, 0 AS order_amount_comparison
    FROM Erp.OrderHed
    WHERE OrderDate >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
      AND OrderDate < DATEADD(year, 1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1))
    GROUP BY Company`;
  assert.equal(service.validate(constantComparison, plan).valid, false);

  const zeroedComparison = `WITH totals AS (
      SELECT Company, YEAR(OrderDate) AS period, SUM(DocOrderAmt) AS order_amount
      FROM Erp.OrderHed
      WHERE (OrderDate >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1) AND OrderDate < DATEADD(day, 1, CAST(GETDATE() AS date)))
         OR (OrderDate >= DATEADD(year, -1, DATEFROMPARTS(YEAR(GETDATE()), 1, 1)) AND OrderDate < DATEADD(year, -1, DATEADD(day, 1, CAST(GETDATE() AS date))))
      GROUP BY Company, YEAR(OrderDate)
    )
    SELECT TOP 100 current_period.Company, current_period.order_amount AS order_amount,
      previous_period.order_amount * 0 AS order_amount_comparison
    FROM totals current_period
    LEFT JOIN totals previous_period ON previous_period.Company = current_period.Company AND previous_period.period = current_period.period - 1
    WHERE current_period.period = YEAR(GETDATE())`;
  assert.equal(service.validate(zeroedComparison, plan).valid, false);
});

test("analysis plan coverage includes required metrics and uses exact identifier tokens", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = {
    mode: "strict" as const,
    grain: [], metrics: ["order_amount"], requiredMetrics: ["gross_margin_rate"],
    filters: [], dimensions: [], orderBy: [],
  };
  const result = service.validate("SELECT TOP 100 Company, SUM(DocOrderAmt) AS order_amount, 1 AS not_gross_margin_rate_extra FROM Erp.OrderHed GROUP BY Company", plan);

  assert.equal(result.valid, false);
  assert.deepEqual(result.missing.metrics, ["gross_margin_rate"]);
});

test("analysis plan coverage does not treat high or low projection as filtering", () => {
  const service = new AnalysisPlanCoverageService();
  const plan = { mode: "strict" as const, grain: [], metrics: ["order_amount"], filters: [{ metric: "order_amount", op: "high" as const }], dimensions: [], orderBy: [] };
  const result = service.validate(
    "SELECT TOP 100 Company, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company",
    plan,
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.missing.filters, ["order_amount:high"]);
  assert.equal(service.validate("SELECT TOP 10 Company, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company ORDER BY order_amount DESC", plan).valid, true);
  assert.equal(service.validate("WITH totals AS (SELECT Company, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company) SELECT TOP 100 Company, order_amount FROM totals WHERE order_amount > 100", plan).valid, true);
  assert.equal(service.validate("WITH totals AS (SELECT Company, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company) SELECT TOP 100 Company, order_amount FROM totals WHERE order_amount < 100", plan).valid, false);
  assert.equal(service.validate("WITH totals AS (SELECT Company, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company) SELECT TOP 100 Company, order_amount FROM totals WHERE order_amount > 100", { ...plan, filters: [{ metric: "order_amount", op: "low" }] }).valid, false);
});
