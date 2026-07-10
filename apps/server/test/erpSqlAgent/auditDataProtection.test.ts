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
  assert.deepEqual(result.audit.fieldCategories, ["financial", "identity"]);
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
