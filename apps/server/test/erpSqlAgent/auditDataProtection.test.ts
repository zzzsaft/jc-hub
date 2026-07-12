import assert from "node:assert/strict";
import test from "node:test";
import { protectAgentTitle, protectAuditValue, protectBindingParams, protectError, rawAuditPayloadsEnabled } from "../../src/ai/audit/dataProtection.js";
import { buildRetentionReport } from "../../src/modules/erpSqlAgent/scripts/auditLogRetention.js";
import { ResultNarratorService } from "../../src/modules/erpSqlAgent/agent/service/ResultNarratorService.js";
import { configureAuditDbConcurrency, getAuditDbConcurrencyMetrics, runAuditDbWrite } from "../../src/ai/audit/auditDbLimiter.js";

test("ordinary audit payloads omit rows, parameters, sensitive text, and stacks", () => {
  delete process.env.ERP_AUDIT_RAW_PAYLOADS_ENABLED;
  const value = protectAuditValue({
    question: "客户 ACME 电话 13800138000",
    sql: "SELECT * FROM Customer WHERE Name='ACME'",
    rows: [["ACME", "13800138000"]],
    params: { customer: "ACME" },
  }) as Record<string, unknown>;
  const error = protectError(Object.assign(new Error("token=secret backend down"), { stack: "PRIVATE STACK" }));

  assert.equal(JSON.stringify(value).includes("ACME"), false);
  assert.equal(JSON.stringify(value).includes("13800138000"), false);
  assert.equal(JSON.stringify(value).includes("SELECT"), false);
  assert.equal(JSON.stringify(error).includes("PRIVATE STACK"), false);
  assert.equal(JSON.stringify(error).includes("secret"), false);
});

test("binding audit records hashes rather than values", () => {
  const params = protectBindingParams({ customerName: "ACME", limit: 20 });
  assert.equal(JSON.stringify(params).includes("ACME"), false);
  assert.equal((params.customerName as { valueHash: string }).valueHash.length, 64);
});

test("ERP agent session titles and production raw payloads stay protected by default", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.ERP_AUDIT_RAW_PAYLOADS_ENABLED = "true";
  delete process.env.ERP_AUDIT_RAW_PAYLOADS_TRUSTED;
  assert.equal(rawAuditPayloadsEnabled(), false);
  assert.equal(protectAgentTitle("erpSqlAgent", "客户 ACME 的销售额")?.includes("ACME"), false);
  process.env.ERP_AUDIT_RAW_PAYLOADS_TRUSTED = "true";
  assert.equal(rawAuditPayloadsEnabled(), true);
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  delete process.env.ERP_AUDIT_RAW_PAYLOADS_ENABLED;
  delete process.env.ERP_AUDIT_RAW_PAYLOADS_TRUSTED;
});

test("retention audit is dry-run and performs no writes", () => {
  const report = buildRetentionReport(new Date("2026-07-10T00:00:00.000Z"), 90, {
    llmCalls: 2,
    agentMessages: 3,
    agentToolCalls: 4,
    erpSqlTraces: 5,
  });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.candidateTotal, 14);
  assert.equal(report.writesPerformed, false);
});

test("result narrator does not send ERP rows externally by default", async () => {
  delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED;
  delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED;
  let calls = 0;
  const result = await new ResultNarratorService(async () => {
    calls += 1;
    return "{}";
  }).narrate({
    question: "客户 ACME 的金额",
    sql: "SELECT CustomerName, Amount FROM Erp.OrderHed",
    fields: ["CustomerName", "Amount"],
    rows: [["ACME", 100]],
    rowCount: 1,
    truncated: false,
    warnings: [],
  });
  assert.equal(calls, 0);
  assert.equal(result.audit.externalDataSent, false);
  assert.equal(result.audit.externalRawRowsSent, false);
  assert.deepEqual(result.audit.fieldCategories, ["financial", "identity"]);
});

test("result narrator sends raw rows only with the dedicated trusted switch", async () => {
  const originalEnabled = process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED;
  const originalTrusted = process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED;
  const originalRawRows = process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED;
  process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED = "true";
  process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED = "true";
  process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED = "true";
  let input: any;
  try {
    const result = await new ResultNarratorService(async (params) => {
      input = params.input;
      return JSON.stringify({ summary: "已分析结果。", highlights: [], caveats: [] });
    }).narrate({
      question: "查询订单明细",
      sql: "SELECT CustomerName, Amount FROM Erp.OrderHed",
      fields: ["CustomerName", "Amount"],
      rows: [["ACME", 100]],
      rowCount: 1,
      truncated: false,
      warnings: [],
    });
    assert.deepEqual(input.fields, ["CustomerName", "Amount"]);
    assert.deepEqual(input.rows, [["ACME", 100]]);
    assert.equal(input.raw_rows_sent, true);
    assert.equal(result.audit.externalRawRowsSent, true);
  } finally {
    if (originalEnabled === undefined) delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED;
    else process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED = originalEnabled;
    if (originalTrusted === undefined) delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED;
    else process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED = originalTrusted;
    if (originalRawRows === undefined) delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED;
    else process.env.ERP_RESULT_NARRATOR_EXTERNAL_RAW_ROWS_ENABLED = originalRawRows;
  }
});

test("customer sales ranking is narrated locally with names and amounts", async () => {
  const originalEnabled = process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED;
  const originalTrusted = process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED;
  process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED = "true";
  process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED = "true";
  let calls = 0;
  try {
    const result = await new ResultNarratorService(async () => {
      calls += 1;
      return "{}";
    }).narrate({
      question: "最近一个月销售额最高的客户有哪些？",
      sql: "SELECT CustomerName, SalesAmount FROM Erp.OrderDtl",
      fields: ["CustomerName", "SalesAmount"],
      rows: [["客户 A", 5_309_734.55], ["客户 B", 1_747_541.57]],
      rowCount: 2,
      truncated: false,
      warnings: [],
    });
    assert.equal(calls, 0);
    assert.equal(result.audit.externalDataSent, false);
    assert.match(result.summary, /2 名客户/);
    assert.deepEqual(result.highlights, ["1. 客户 A：530.97 万元", "2. 客户 B：174.75 万元"]);
  } finally {
    if (originalEnabled === undefined) delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED;
    else process.env.ERP_RESULT_NARRATOR_EXTERNAL_ENABLED = originalEnabled;
    if (originalTrusted === undefined) delete process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED;
    else process.env.ERP_RESULT_NARRATOR_EXTERNAL_TRUSTED = originalTrusted;
  }
});

test("product category sales ranking is narrated locally with category codes", async () => {
  let calls = 0;
  const result = await new ResultNarratorService(async () => {
    calls += 1;
    return "{}";
  }).narrate({
    question: "按产品类别区分，上个月销售额最高的是哪些？",
    sql: "SELECT ProdCode, SalesAmount FROM Erp.OrderDtl",
    fields: ["ProdCode", "SalesAmount"],
    rows: [["0910", 24_850_349.14], ["091020", 16_620_277.46]],
    rowCount: 2,
    truncated: false,
    warnings: [],
  });
  assert.equal(calls, 0);
  assert.equal(result.audit.externalDataSent, false);
  assert.match(result.summary, /2 个产品类别/);
  assert.deepEqual(result.highlights, ["1. 0910：2,485.03 万元", "2. 091020：1,662.03 万元"]);
});

test("audit DB limiter caps concurrency and rejects excess queued writes", async () => {
  configureAuditDbConcurrency(1, 1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = runAuditDbWrite(() => gate);
  const second = runAuditDbWrite(async () => undefined);

  await assert.rejects(runAuditDbWrite(async () => undefined), /audit_db queue is full/);
  assert.deepEqual({ active: getAuditDbConcurrencyMetrics().active, queued: getAuditDbConcurrencyMetrics().queued }, { active: 1, queued: 1 });
  release();
  await Promise.all([first, second]);
  configureAuditDbConcurrency(4, 100);
});
