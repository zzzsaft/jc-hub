import assert from "node:assert/strict";
import test from "node:test";
import {
  ComplexQueryAnalysisService,
  type ComplexQueryAnalysisInput,
  type ComplexQueryPlan,
  type ComplexQueryStepResult,
} from "../../src/modules/erpSqlAgent/complexQuery/index.js";

test("external-off returns deterministic step row and coverage analysis with zero requester calls", async () => {
  await withNarratorEnv({}, async () => {
    let calls = 0;
    const result = await new ComplexQueryAnalysisService(async () => {
      calls += 1;
      return "{}";
    }).analyze(input());
    assert.equal(calls, 0);
    assert.match(result.summary, /2\/3 个可用步骤/u);
    assert.match(result.summary, /margin 1\/2/u);
    assert.ok(result.caveats.some((value) => value.includes("collection")));
    assert.equal(result.audit.externalDataSent, false);
  });
});

test("Analyst is evidence-only and Reviewer receives analyst plus execution evidence", async () => {
  await withNarratorEnv({ enabled: "true", trusted: "true" }, async () => {
    const calls: any[] = [];
    const result = await new ComplexQueryAnalysisService(async (params) => {
      calls.push(params);
      if (calls.length === 1) return JSON.stringify({ summary: "margin.margin 显示一行毛利。", highlights: ["margin.margin=0.2"], caveats: [] });
      return JSON.stringify({ status: "approved", issues: [] });
    }).analyze(input());

    assert.equal(calls.length, 2);
    assert.match(calls[0].messages[0].content, /only use supplied results; cite step\/field evidence; never infer missing causes/u);
    assert.match(calls[0].messages[0].content, /Never generate SQL/u);
    for (const call of calls) {
      assert.equal(JSON.stringify(call.input).includes(input().question), false);
      assert.equal(JSON.stringify(call.messages).includes(input().question), false);
    }
    assert.deepEqual(JSON.parse(calls[0].messages[1].content).intent, {
      scenario: "diagnostic_finance_composite",
      modules: ["finance"],
      metrics: ["amount"],
      dimensions: ["customer"],
    });
    const reviewPayload = JSON.stringify(calls[1].input);
    assert.equal(reviewPayload.includes("ACME"), false);
    assert.equal(reviewPayload.includes("query_failed"), false);
    assert.deepEqual(calls[1].input.planCorrections.map(({ sourceText: _sourceText, ...value }: any) => value), [
      { field: "timeRange", before: { kind: "current_year" }, after: { kind: "current_year_first_half" } },
      { field: "filters.gross_margin_rate", before: [{ metric: "gross_margin_rate", op: "low" }], after: { metric: "gross_margin_rate", op: "lt", value: 0.2 } },
      { field: "limit", before: 20, after: 10 },
    ]);
    assert.equal(calls[1].input.planCorrections.every((item: any) => item.sourceText.redacted === true), true);
    assert.equal(calls[1].input.steps[2].status, "failed");
    const reviewerSystem = calls[1].messages[0].content;
    assert.match(reviewerSystem, /Approved JSON exactly: \{"status":"approved","issues":\[\]\}/u);
    assert.match(reviewerSystem, /Revised JSON exactly: \{"status":"revised","issues":\[\],"revised":\{"summary":"\.\.\.","highlights":\[\],"caveats":\[\]\}\}/u);
    assert.match(reviewerSystem, /Rejected JSON exactly: \{"status":"rejected","issues":\[\]\}/u);
    const reviewerUser = JSON.parse(calls[1].messages[1].content);
    assert.deepEqual(reviewerUser.intent, {
      scenario: "diagnostic_finance_composite",
      modules: ["finance"],
      metrics: ["amount"],
      dimensions: ["customer"],
    });
    assert.deepEqual(reviewerUser.outputShapes.revised, {
      status: "revised", issues: [], revised: { summary: "string", highlights: [], caveats: [] },
    });
    assert.equal(result.review.status, "approved");
    assert.equal(result.audit.externalDataSent, true);
  });
});

test("plan corrections reject unknown fields and unsafe structures before any external call", async () => {
  await withNarratorEnv({ enabled: "true", trusted: "true" }, async () => {
    let calls = 0;
    await assert.rejects(new ComplexQueryAnalysisService(async () => {
      calls += 1;
      return "{}";
    }).analyze({
      ...input(),
      planCorrections: [{ field: "customer", before: "ACME", after: "C001", sourceText: "客户 ACME" }],
    }));
    assert.equal(calls, 0);
  });
});

test("Reviewer can revise or reject Analyst text", async (t) => {
  await withNarratorEnv({ enabled: "true", trusted: "true" }, async () => {
    await t.test("revision", async () => {
      let call = 0;
      const result = await new ComplexQueryAnalysisService(async () => ++call === 1
        ? JSON.stringify({ summary: "draft", highlights: ["claim"], caveats: [] })
        : JSON.stringify({ status: "revised", issues: ["claim too broad"], revised: { summary: "evidence-limited", highlights: [], caveats: ["one row only"] } }))
        .analyze(input());
      assert.equal(result.summary, "evidence-limited");
      assert.deepEqual(result.review, { status: "revised", issues: ["claim too broad"] });
    });
    await t.test("rejection", async () => {
      let call = 0;
      const result = await new ComplexQueryAnalysisService(async () => ++call === 1
        ? JSON.stringify({ summary: "draft", highlights: ["unsupported claim"], caveats: [] })
        : JSON.stringify({ status: "rejected", issues: ["missing evidence"] }))
        .analyze(input());
      assert.deepEqual(result.highlights, []);
      assert.match(result.summary, /已组合 2\/3 个可用步骤/u);
      assert.notEqual(result.summary, "draft");
      assert.ok(result.caveats.some((value) => /evidence gap/u.test(value)));
      assert.equal(result.caveats.some((value) => value.includes("missing evidence")), false);
      assert.equal(result.review.status, "rejected");
    });
  });
});

test("Reviewer response states enforce approved revised and rejected semantics", async () => {
  await withNarratorEnv({ enabled: "true", trusted: "true" }, async () => {
    const invalidReviews = [
      { status: "approved", issues: [], revised: { summary: "replacement", highlights: [], caveats: [] } },
      { status: "revised", issues: [] },
      { status: "rejected", issues: [], revised: { summary: "replacement", highlights: [], caveats: [] } },
    ];
    for (const invalidReview of invalidReviews) {
      let call = 0;
      const result = await new ComplexQueryAnalysisService(async () => ++call === 1
        ? JSON.stringify({ summary: "draft", highlights: [], caveats: [] })
        : JSON.stringify(invalidReview)).analyze(input());
      assert.match(result.summary, /已组合 2\/3 个可用步骤/u);
      assert.deepEqual(result.review, { status: "rejected", issues: ["complex_analysis_review_failed"] });
    }
  });
});

test("both role failures retain deterministic analysis and mark the fallback", async () => {
  await withNarratorEnv({ enabled: "true", trusted: "true" }, async () => {
    let calls = 0;
    const result = await new ComplexQueryAnalysisService(async () => {
      calls += 1;
      throw new Error("offline");
    }).analyze(input());
    assert.equal(calls, 2);
    assert.match(result.summary, /2\/3 个可用步骤/u);
    assert.ok(result.caveats.includes("complex_analysis_llm_failed"));
  });
});

function input(): ComplexQueryAnalysisInput {
  const steps: ComplexQueryStepResult[] = [
    result("anchor", "completed", ["Company", "customer", "amount"], [["EPIC03", "C1", 100], ["EPIC03", "C2", 200]]),
    result("margin", "partial", ["Company", "customer", "margin"], [["EPIC03", "C1", 0.2]]),
    { ...result("collection", "failed", [], []), error: "query_failed" },
  ];
  return {
    question: "哪些客户金额大但毛利低？",
    plan: plan(),
    steps,
    composed: {
      status: "partial",
      fields: ["Company", "customer", "amount", "margin"],
      rows: [["EPIC03", "C1", 100, 0.2], ["EPIC03", "C2", 200, null]],
      rowCount: 2,
      truncated: false,
      warnings: ["complex_join_unmatched:margin:1"],
      joinCoverage: [
        { stepId: "margin", keys: ["Company", "customer"], anchorRows: 2, matchedRows: 1, unmatchedRows: 1, coverageRate: 0.5 },
        { stepId: "collection", keys: [], anchorRows: 2, matchedRows: 0, unmatchedRows: 2, coverageRate: 0 },
      ],
    },
    planCorrections: [
      { field: "timeRange", before: { kind: "current_year" }, after: { kind: "current_year_first_half" }, sourceText: "今年上半年客户 ACME" },
      { field: "filters.gross_margin_rate", before: [{ metric: "gross_margin_rate", op: "low" }], after: { metric: "gross_margin_rate", op: "lt", value: 0.2 }, sourceText: "客户 ACME 毛利低于 20%" },
      { field: "limit", before: 20, after: 10, sourceText: "客户 ACME 前 10 名" },
    ],
  };
}

function plan(): ComplexQueryPlan {
  const base = { question: "test", capabilityCode: "test", module: "finance" as const, metrics: ["amount"], dimensions: ["customer"], joinKeys: ["Company", "customer"], filters: [], orderBy: [], limit: 20 };
  return {
    scenario: "diagnostic_finance_composite", objective: "test", resultLimit: 20, entityGrain: ["Company", "customer"],
    steps: [
      { ...base, id: "anchor", dependsOn: [] },
      { ...base, id: "margin", dependsOn: ["anchor"] },
      { ...base, id: "collection", dependsOn: ["anchor"] },
    ],
    joinPolicy: { keys: ["Company", "customer"], allowNameBasedJoin: false },
    budget: { maxQueries: 8, maxRowsPerQuery: 500, timeoutMs: 30_000 }, diagnostic: true,
  };
}

function result(id: string, status: ComplexQueryStepResult["status"], fields: string[], rows: unknown[][]): ComplexQueryStepResult {
  return { id, status, fields, rows, rowCount: rows.length, truncated: false, warnings: [] };
}

async function withNarratorEnv(values: { enabled?: string; trusted?: string; raw?: string }, run: () => Promise<void>) {
  const keys = ["ERP_RESULT_NARRATOR_EXTERNAL_ENABLED", "ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED", "ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED"] as const;
  const before = keys.map((key) => process.env[key]);
  const next = [values.enabled, values.trusted, values.raw];
  keys.forEach((key, index) => next[index] === undefined ? delete process.env[key] : process.env[key] = next[index]);
  try { await run(); } finally {
    keys.forEach((key, index) => before[index] === undefined ? delete process.env[key] : process.env[key] = before[index]);
  }
}
