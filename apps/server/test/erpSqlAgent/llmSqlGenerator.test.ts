import assert from "node:assert/strict";
import test from "node:test";
import { LlmSqlGeneratorService, type LlmSqlGeneratorRequester, type SqlGeneratorGuard } from "../../src/modules/erpSqlAgent/generator/index.js";
import type { SqlGuardResult } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { makeGeneratorPlan } from "./sqlGeneratorTestHelpers.js";

class FakeGuard implements SqlGeneratorGuard {
  readonly sql: string[] = [];

  constructor(private readonly valid = true) {}

  async validate(sql: string): Promise<SqlGuardResult> {
    this.sql.push(sql);
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
    })),
  };
  const generator = new LlmSqlGeneratorService(requester, new FakeGuard());

  await generator.generate(plan);

  assert.equal(input.references.length, 5);
  assert.equal(input.references[2].exampleSql, "SELECT 2");
  assert.equal(input.references[3].exampleSql, undefined);
  assert.equal(input.references[4].sqlPreview, undefined);
});
