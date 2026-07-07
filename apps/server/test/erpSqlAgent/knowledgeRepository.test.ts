import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeRepository } from "../../src/modules/erpSqlAgent/knowledge/index.js";

const repository = new KnowledgeRepository();

test("can read purchase module", () => {
  const module = repository.getModule("purchase");

  assert.equal(module?.label, "采购");
});

test("purchase returns core tables", () => {
  const module = repository.getModule("purchase");

  assert(module?.coreTables.includes("POHeader"));
  assert(module.coreTables.includes("PODetail"));
  assert(module.coreTables.includes("PORel"));
});

test("purchase returns join rules", () => {
  const rules = repository.getJoinRules("purchase");

  assert(rules.some((rule) => rule.from === "POHeader" && rule.to === "PODetail"));
  assert(rules.some((rule) => rule.from === "PODetail" && rule.to === "PORel"));
  assert(rules.some((rule) => rule.from === "RcvHead" && rule.to === "RcvDtl"));
  assert(rules.some((rule) => rule.from === "APInvHed" && rule.to === "APInvDtl"));
});

test("date rules include global safety range", () => {
  const rules = repository.getDateRules();

  assert.equal(rules.globalSafetyRange.minExpression, "日期字段 >= '20000101'");
  assert.equal(rules.globalSafetyRange.maxExpression, "日期字段 < DATEADD(year, 1, CAST(GETDATE() AS date))");
});

test("status rules include JobClosed and JobComplete", () => {
  const fields = repository.getStatusRules().rules.map((rule) => rule.field);

  assert(fields.includes("JobClosed"));
  assert(fields.includes("JobComplete"));
});

test("quality rules include PORel orphan rule", () => {
  const rules = repository.getQualityRules();

  assert(rules.rules.some((rule) => rule.id === "porel-orphan-left-join"));
  assert(rules.rules.some((rule) => rule.id === "future-date-outliers"));
});

test("company rules require Company output", () => {
  const rules = repository.getCompanyRules();

  assert.equal(rules.mustOutputCompany, true);
});

test("prompt rules default limit is 100", () => {
  const rules = repository.getPromptRules();

  assert.equal(rules.defaultLimit, 100);
});

test("unknown module returns undefined or empty arrays", () => {
  assert.equal(repository.getModule("missing"), undefined);
  assert.deepEqual(repository.getJoinRules("missing"), []);
  assert.equal(repository.getDateRules("missing"), undefined);
  assert.deepEqual(repository.getStatusRules("missing"), []);
});
