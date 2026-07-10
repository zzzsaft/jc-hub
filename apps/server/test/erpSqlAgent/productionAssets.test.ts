import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_NUMBER_SLOT_RULES,
  ERP_DATA_GATEWAY_CONTRACT_V1,
  ERP_SQL_GOVERNED_ASSETS,
  ERP_SQL_PRODUCTION_ASSET_CHECKLIST,
  extractContractNo,
  findGovernedAsset,
} from "../../src/modules/erpSqlAgent/assets/index.js";

test("production asset checklist keeps all 12 numbered items with evidence and blockers", () => {
  assert.deepEqual(ERP_SQL_PRODUCTION_ASSET_CHECKLIST.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const item of ERP_SQL_PRODUCTION_ASSET_CHECKLIST) {
    assert(item.facts.length > 0, `item ${item.id} facts`);
    assert(item.implementation.length > 0, `item ${item.id} implementation`);
    assert(item.tests.length > 0, `item ${item.id} tests`);
    assert(item.dependencies.length > 0, `item ${item.id} dependencies`);
  }
  assert.equal(ERP_SQL_PRODUCTION_ASSET_CHECKLIST.find((item) => item.id === 10)?.status, "complete");
  assert.equal(ERP_SQL_PRODUCTION_ASSET_CHECKLIST.find((item) => item.id === 11)?.status, "complete");
});

test("quotation asset has contract slot signals and adjacent sales-order negatives", () => {
  const quotation = findGovernedAsset("quotation.family_008_080");
  assert(quotation);
  assert.equal(quotation.approvalStatus, "blocked");
  assert.equal(quotation.useLevel, "blocked");
  assert.deepEqual((quotation.definition.signals as string[]).slice(0, 4), ["配置清单", "配置内容", "外部库记录", "产品购销合同"]);
  assert.equal(extractContractNo("查合同号 HT20260001 的产品报价"), "HT20260001");
  assert.equal(extractContractNo("合同编号: JC-2026-0008 的配置内容"), "JC-2026-0008");
  assert.equal(extractContractNo("销售订单 40003 的产品明细"), undefined);
  assert(CONTRACT_NUMBER_SLOT_RULES.negativePatterns.some((pattern) => pattern.test("工单号 JOB123 的缺料")));
});

test("inventory asset separates ordinary stock from safety stock and aging", () => {
  const inventory = findGovernedAsset("inventory.exclusive_stock_safety_aging");
  assert(inventory);
  assert.equal(inventory.approvalStatus, "draft");
  assert.deepEqual(inventory.definition.ordinaryFamilies, ["family_027", "family_050"]);
  assert.equal(inventory.definition.safetyAgingFamily, "family_089");
  assert((inventory.definition.ordinarySignals as string[]).includes("近期交易"));
  assert((inventory.definition.safetyAgingSignals as string[]).includes("库龄"));
});

test("job material and labor assets keep adjacent family and forbidden schema negatives", () => {
  const jobMaterial = findGovernedAsset("job_material.family_076_086");
  assert(jobMaterial);
  assert.deepEqual(jobMaterial.definition.conflictFamilies, ["family_031", "family_006"]);
  assert((jobMaterial.definition.verifiedTables as string[]).includes("Erp.JobMtl"));
  assert((jobMaterial.definition.verifiedTables as string[]).includes("Erp.JobAsmbl"));

  const labor = findGovernedAsset("labor.family_014_092");
  assert(labor);
  assert.deepEqual(labor.definition.forbiddenTables, ["Erp.QiMoJob", "Erp.ResourceGroup"]);
  assert.deepEqual(labor.definition.forbiddenFields, ["Erp.OpMaster.Void"]);
  assert.equal(labor.definition.llmFallbackSchemaEvidencePolicy, "exclude_unconfirmed_tables");
});

test("finance asset defines metric governance and exact-estimate boundary", () => {
  const finance = findGovernedAsset("finance.metric_catalog_scope");
  assert(finance);
  assert.equal(finance.approvalStatus, "draft");
  assert((finance.definition.requiredMetadata as string[]).includes("currency"));
  assert((finance.definition.requiredMetadata as string[]).includes("refundPolicy"));
  assert.equal(finance.definition.exactBoundary, "approved metric/template only");
  assert.equal(finance.definition.estimateDisclaimer, "此数据不准确，仅供参考");
});

test("schema snapshot asset requires freshness and fail-closed drift policy", () => {
  const snapshot = findGovernedAsset("schema.snapshot_binding");
  assert(snapshot);
  assert((snapshot.definition.requiredFields as string[]).includes("snapshotId"));
  assert.equal((snapshot.definition.freshness as Record<string, unknown>).expiredPolicy, "fail_closed");
  assert.equal((snapshot.definition.freshness as Record<string, unknown>).unknownFieldPolicy, "fail_closed");
  assert((snapshot.definition.driftSignals as string[]).includes("missing_field"));
});

test("gateway contract blocks direct SQL generator access and requires stable response metadata", () => {
  const api = findGovernedAsset("api.erp_data_gateway.v1");
  assert(api);
  assert.equal(api.definition.directSqlGeneratorAccess, false);
  assert((api.definition.requiredRequest as string[]).includes("actor"));
  assert((api.definition.requiredResponse as string[]).includes("traceId"));
  assert.equal(ERP_DATA_GATEWAY_CONTRACT_V1.response.pageInfo.cursorSignature, "hmac-sha256");
  assert.equal(ERP_DATA_GATEWAY_CONTRACT_V1.response.sql, "debug_only");
});

test("pagination and freshness assets prohibit default full export and current-time placeholders", () => {
  const pagination = findGovernedAsset("pagination.cursor_v1");
  assert(pagination);
  assert.equal(pagination.definition.cursorSignature, "hmac-sha256");
  assert.equal(pagination.definition.nextPagePolicy, "recheck_actor_scope_against_same_snapshot");
  assert.equal(pagination.definition.exportPolicy, "no_default_full_export");

  const freshness = findGovernedAsset("freshness.response_contract");
  assert(freshness);
  assert.deepEqual(freshness.definition.appliesTo, ["exact", "estimate", "no_result"]);
  assert.equal(freshness.definition.forbiddenSource, "current_time_placeholder");
});

test("audit and security assets reuse fail-closed protected policies", () => {
  const audit = findGovernedAsset("audit.rendered_sql_hash");
  assert(audit);
  assert.equal(audit.approvalStatus, "approved");
  assert.equal(audit.definition.sqlHash, "rendered_or_final_sql_sha256");
  assert.equal(audit.definition.invalidPublicSql, "");
  assert((audit.definition.terminalStatuses as string[]).includes("cancelled"));
  assert((audit.definition.terminalStatuses as string[]).includes("audit_degraded"));

  const security = findGovernedAsset("security.fail_closed_policy");
  assert(security);
  assert.equal(security.approvalStatus, "approved");
  assert.equal(security.definition.promptCannotExpandScope, true);
  assert.deepEqual(security.definition.failClosedCases, ["cross_user", "cross_company", "cross_department", "cross_customer", "sensitive_alias_rename", "mixed_dbo_jcjdy"]);
});

test("cost asset is versioned, configured, and treats template fast path as not_sent zero cost", () => {
  const cost = findGovernedAsset("cost.llm_budget_v1");
  assert(cost);
  assert.equal(cost.version, "2026-07-10.CNY.v1");
  assert.equal(cost.definition.currency, "CNY");
  assert.equal((cost.definition.lifecycle as Record<string, unknown>).notSentCost, 0);
  assert.equal((cost.definition.lifecycle as Record<string, unknown>).templateFastPathTokens, "not_sent");
  assert.deepEqual(cost.definition.budgetThresholds, [0.7, 0.9, 1]);
  assert.equal(cost.definition.priceSource, "configuration_version_not_hardcoded");
});

test("governed asset registry has one row per production-readiness item", () => {
  assert.equal(ERP_SQL_GOVERNED_ASSETS.length, 12);
  assert.equal(new Set(ERP_SQL_GOVERNED_ASSETS.map((asset) => asset.assetKey)).size, 12);
  assert(ERP_SQL_GOVERNED_ASSETS.every((asset) => asset.version.length > 0));
  assert(ERP_SQL_GOVERNED_ASSETS.every((asset) => asset.ownerRole.length > 0));
});
