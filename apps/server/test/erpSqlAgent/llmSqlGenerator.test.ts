import assert from "node:assert/strict";
import test from "node:test";
import { LlmSqlGeneratorService, type LlmSqlGeneratorRequester, type SqlGeneratorGuard } from "../../src/modules/erpSqlAgent/generator/index.js";
import type { SqlGuardOptions, SqlGuardResult } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { makeGeneratorPlan } from "./sqlGeneratorTestHelpers.js";

class FakeGuard implements SqlGeneratorGuard {
  readonly sql: string[] = [];
  readonly options: SqlGuardOptions[] = [];

  constructor(private readonly valid = true) {}

  async validate(sql: string, options: SqlGuardOptions = {}): Promise<SqlGuardResult> {
    this.sql.push(sql);
    this.options.push(options);
    return {
      valid: this.valid,
      errors: this.valid ? [] : ["blocked"],
      warnings: this.valid ? [] : ["guard warning"],
      normalizedSql: sql.trim(),
      referencedTables: ["Erp.POHeader"],
      referencedFields: ["Company"],
    };
  }
}

test("LLM SQL generator parses SQL and validates it with guard", async () => {
  const guard = new FakeGuard();
  const requester: LlmSqlGeneratorRequester = async () => JSON.stringify({
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    assumptions: ["uses POHeader"],
    warnings: ["llm warning"],
  });
  const generator = new LlmSqlGeneratorService(requester, guard);

  const result = await generator.generate(makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false));

  assert.equal(result.source, "llm");
  assert.equal(result.scenario, "llmFallback");
  assert.equal(result.valid, true);
  assert.equal(guard.sql[0], "SELECT TOP 100 Company FROM Erp.POHeader");
  assert.deepEqual(result.assumptions, ["uses POHeader"]);
  assert(result.warnings.includes("llm warning"));
});

test("LLM SQL generator rejects malformed JSON output", async () => {
  const generator = new LlmSqlGeneratorService(async () => "not json", new FakeGuard());

  await assert.rejects(
    () => generator.generate(makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false)),
    /Unexpected token|JSON/,
  );
});

test("LLM SQL generator rejects output without sql", async () => {
  const generator = new LlmSqlGeneratorService(async () => JSON.stringify({ assumptions: [], warnings: [] }), new FakeGuard());

  await assert.rejects(
    () => generator.generate(makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false)),
    /sql/,
  );
});

test("LLM SQL generator returns guard errors without masking them", async () => {
  const generator = new LlmSqlGeneratorService(
    async () => JSON.stringify({ sql: "DELETE FROM Erp.POHeader", assumptions: [], warnings: [] }),
    new FakeGuard(false),
  );

  const result = await generator.generate(makeGeneratorPlan("purchase", "删除采购订单", "list", ["POHeader"], false));

  assert.equal(result.valid, false);
  assert.deepEqual(result.guardResult.errors, ["blocked"]);
  assert(result.warnings.includes("guard warning"));
});

test("LLM SQL generator keeps top references but limits SQL previews", async () => {
  let input: any;
  const requester: LlmSqlGeneratorRequester = async (params) => {
    input = params.input;
    return JSON.stringify({
      sql: "SELECT TOP 100 Company FROM Erp.POHeader",
      assumptions: [],
      warnings: [],
    });
  };
  const plan = {
    ...makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false),
    references: Array.from({ length: 5 }, (_, index) => ({
      familyId: `family_${index}`,
      businessDescription: `reference ${index}`,
      coreTables: ["Erp.POHeader"],
      joins: [],
      exampleSql: `SELECT ${index}`,
      sqlPreview: `SELECT ${index}`,
      sourceType: "dataset" as const,
      score: 0.9 - index / 10,
      matchedSignals: [`vector:0.${index + 1}`],
    })),
  };
  const generator = new LlmSqlGeneratorService(requester, new FakeGuard());

  const result = await generator.generate(plan);

  assert.equal(input.references.length, 5);
  assert.equal(input.references[2].exampleSql, "SELECT 2");
  assert.equal(input.references[3].exampleSql, undefined);
  assert.equal(input.references[4].sqlPreview, undefined);
  assert.equal(input.references[0].score, 0.9);
  assert.deepEqual(input.references[0].matchedSignals, ["vector:0.1"]);
  assert.equal(result.references?.[0]?.score, 0.9);
  assert.deepEqual(result.references?.[0]?.matchedSignals, ["vector:0.1"]);
});

test("LLM SQL generator passes only metric references for finance plans", async () => {
  let input: any;
  const requester: LlmSqlGeneratorRequester = async (params) => {
    input = params.input;
    return JSON.stringify({
      sql: "SELECT Company, SUM(DocInvoiceAmt) AS [金额字段] FROM Erp.InvcHead GROUP BY Company",
      assumptions: [],
      warnings: [],
    });
  };
  const guard = new FakeGuard();
  const plan = {
    ...makeGeneratorPlan("finance", "查收入", "aggregate", ["InvcHead"], false),
    references: [
      { familyId: "family_old", businessDescription: "old", coreTables: [], joins: [], sourceType: "family" as const },
      {
        familyId: "finance_income",
        metricCode: "finance_revenue",
        metricName: "收入",
        businessDescription: "收入指标",
        calculationSummary: "按发票确认收入",
        definitionJson: { timeField: "InvcHead.InvoiceDate", refundPolicy: "deduct_credit_memo" },
        coreTables: ["Erp.InvcHead"],
        joins: [],
        sourceType: "metric" as const,
      },
    ],
  };
  const generator = new LlmSqlGeneratorService(requester, guard);

  await generator.generate(plan);

  assert.equal(input.references.length, 1);
  assert.equal(input.references[0].sourceType, "metric");
  assert.equal(input.references[0].definitionJson.refundPolicy, "deduct_credit_memo");
  assert.equal(guard.options[0]?.module, "finance");
  assert.equal(guard.options[0]?.references?.[0]?.sourceType, "metric");
});
