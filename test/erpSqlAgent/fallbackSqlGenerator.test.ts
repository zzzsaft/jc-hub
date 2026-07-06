import assert from "node:assert/strict";
import test from "node:test";
import { FallbackSqlGeneratorService, type ErpSqlGenerator, type SqlGenerationResult } from "../../src/modules/erpSqlAgent/generator/index.js";
import { makeGeneratorPlan } from "./sqlGeneratorTestHelpers.js";

class FakeGenerator implements ErpSqlGenerator {
  calls = 0;

  constructor(private readonly result: SqlGenerationResult, private readonly error?: Error) {}

  async generate(): Promise<SqlGenerationResult> {
    this.calls += 1;
    if (this.error) throw this.error;
    return this.result;
  }
}

test("fallback generator calls LLM first by default", async () => {
  const rule = new FakeGenerator(makeResult({ scenario: "purchaseDetail" }));
  const llm = new FakeGenerator(makeResult({ source: "llm", scenario: "llmFallback" }));
  const generator = new FallbackSqlGeneratorService(rule, llm, () => true);

  const result = await generator.generate(makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false));

  assert.equal(result.source, "llm");
  assert.equal(result.scenario, "llmFallback");
  assert.equal(rule.calls, 0);
  assert.equal(llm.calls, 1);
});

test("fallback generator does not call rule generator when LLM succeeds", async () => {
  const rule = new FakeGenerator(makeResult({ scenario: "generic" }));
  const llm = new FakeGenerator(makeResult({ source: "llm", scenario: "llmFallback" }));
  const generator = new FallbackSqlGeneratorService(rule, llm, () => true);

  const result = await generator.generate(makeGeneratorPlan("custom", "查一个规则不支持的问题", "list", ["UD01"], false));

  assert.equal(result.source, "llm");
  assert.equal(llm.calls, 1);
  assert.equal(rule.calls, 0);
});

test("fallback generator calls rule generator when LLM fails", async () => {
  const rule = new FakeGenerator(makeResult({ scenario: "purchaseDetail" }));
  const llm = new FakeGenerator(makeResult({ source: "llm", scenario: "llmFallback" }), new Error("deepseek down"));
  const generator = new FallbackSqlGeneratorService(rule, llm, () => true);

  const result = await generator.generate(makeGeneratorPlan("purchase", "查询采购订单", "list", ["POHeader"], false));

  assert.equal(result.source, "rule");
  assert.equal(result.scenario, "purchaseDetail");
  assert.equal(rule.calls, 1);
  assert.equal(llm.calls, 1);
  assert(result.warnings.some((warning) => warning.includes("LLM SQL fallback failed: deepseek down")));
});

test("fallback generator throws LLM error when rule fallback is disabled", async () => {
  const ruleResult = makeResult({ scenario: "generic" });
  const rule = new FakeGenerator(ruleResult);
  const llm = new FakeGenerator(makeResult({ source: "llm" }), new Error("deepseek down"));
  const generator = new FallbackSqlGeneratorService(rule, llm, () => true, () => false);

  await assert.rejects(
    () => generator.generate(makeGeneratorPlan("custom", "查一个规则不支持的问题", "list", ["UD01"], false)),
    /deepseek down/,
  );
  assert.equal(rule.calls, 0);
});

test("fallback generator does not call LLM when disabled", async () => {
  const rule = new FakeGenerator(makeResult({ scenario: "generic" }));
  const llm = new FakeGenerator(makeResult({ source: "llm", scenario: "llmFallback" }));
  const generator = new FallbackSqlGeneratorService(rule, llm, () => false);

  const result = await generator.generate(makeGeneratorPlan("custom", "查一个规则不支持的问题", "list", ["UD01"], false));

  assert.equal(result.source, "rule");
  assert.equal(llm.calls, 0);
});

test("fallback generator reads disabled env by default", async () => {
  const previous = process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED;
  process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED = "false";
  const rule = new FakeGenerator(makeResult({ scenario: "generic" }));
  const llm = new FakeGenerator(makeResult({ source: "llm", scenario: "llmFallback" }));
  const generator = new FallbackSqlGeneratorService(rule, llm);

  try {
    const result = await generator.generate(makeGeneratorPlan("custom", "查一个规则不支持的问题", "list", ["UD01"], false));

    assert.equal(result.source, "rule");
    assert.equal(llm.calls, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED;
    } else {
      process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED = previous;
    }
  }
});

function makeResult(overrides: Partial<SqlGenerationResult> = {}): SqlGenerationResult {
  return {
    valid: true,
    source: "rule",
    scenario: "purchaseDetail",
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    intent: "list",
    tables: ["Erp.POHeader"],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: {
      valid: overrides.valid ?? true,
      errors: overrides.valid === false ? ["blocked"] : [],
      warnings: [],
      normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
      referencedTables: ["Erp.POHeader"],
      referencedFields: ["Company"],
    },
    ...overrides,
  };
}
