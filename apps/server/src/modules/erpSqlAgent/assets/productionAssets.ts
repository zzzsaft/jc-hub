export type ErpAssetStatus = "complete" | "partial" | "blocked";
export type ErpApprovalStatus = "approved" | "draft" | "blocked";
export type ErpUseLevel = "production_exact" | "decision_support" | "validation_only" | "blocked";

export type ErpSqlProductionAssetItem = {
  id: number;
  title: string;
  status: ErpAssetStatus;
  facts: string[];
  implementation: string[];
  tests: string[];
  dependencies: string[];
};

export type ErpGovernedAssetDefinition = {
  assetKey: string;
  assetType: "template_family" | "metric" | "schema_snapshot" | "api_contract" | "policy" | "cost_price";
  version: string;
  ownerRole: string;
  approvalStatus: ErpApprovalStatus;
  useLevel: ErpUseLevel;
  effectiveFrom?: string;
  effectiveTo?: string;
  definition: Record<string, unknown>;
  evidence: string[];
};

export type ErpDataGatewayContract = {
  request: {
    actor: string;
    purpose: string;
    scope: {
      companies: string[];
      modules: string[];
      departments?: string[];
      businessUnits?: string[];
      customerNumbers?: string[] | "*";
    };
    mode: "exact" | "estimate" | "dry_run";
    execution: "template" | "metric" | "agent";
    maxRows: number;
    deadlineMs: number;
    cursor?: string;
  };
  response: {
    status: "success" | "no_result" | "blocked" | "failed" | "cancelled" | "overloaded";
    semanticStatus: "exact" | "estimate" | "semantic_mismatch";
    confidence: number;
    evidence: string[];
    warnings: string[];
    traceId: string;
    dataAsOf?: string;
    schemaAsOf: string;
    metricVersion?: string;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
      sort: string[];
      snapshotId: string;
      cursorSignature: "hmac-sha256";
    };
    sql?: "debug_only";
  };
};

export const CONTRACT_NUMBER_SLOT_RULES = {
  slot: "ContractNo",
  positivePatterns: [
    /合同号\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{3,39})/iu,
    /合同编号\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{3,39})/iu,
    /购销合同\s*([A-Z0-9][A-Z0-9_-]{3,39})/iu,
    /合同\s*(HT\d{4,}|[A-Z]{1,8}-?\d{3,})/iu,
  ],
  negativePatterns: [
    /销售订单\s*\d+/u,
    /采购订单\s*\d+/u,
    /工单\s*(?:号|编号)?\s*[A-Z0-9_-]+/iu,
    /客户编号\s*[A-Z0-9_-]+/iu,
  ],
  binding: {
    param: "ContractNo",
    type: "string",
    matchMode: "exact_or_like",
    maxLength: 40,
  },
} as const;

export const ERP_SQL_GOVERNED_ASSETS: ErpGovernedAssetDefinition[] = [
  {
    assetKey: "quotation.family_008_080",
    assetType: "template_family",
    version: "2026-07-10.assets.v1",
    ownerRole: "sales_ops_owner",
    approvalStatus: "blocked",
    useLevel: "blocked",
    definition: {
      families: ["family_008", "family_080"],
      signals: ["配置清单", "配置内容", "外部库记录", "产品购销合同", "产品报价", "合同号"],
      tables: ["JCJDY.dbo.ProductQuotation", "JCJDY.dbo.ProductQuotationDetail"],
      slotRules: CONTRACT_NUMBER_SLOT_RULES.binding,
      blockReason: "JCJDY tenant/Company scope field is not proven; runtime policy must fail closed before production execution.",
    },
    evidence: [
      "docs/operations/codex-implementation-log.md#2026-07-10 ERP SQL 报价/库存/工单物料/报工 family 快路径修复",
      "apps/server/src/modules/erpSqlAgent/runtimeGuard/service/sqlSemanticFamilies.ts",
    ],
  },
  {
    assetKey: "inventory.exclusive_stock_safety_aging",
    assetType: "template_family",
    version: "2026-07-10.assets.v1",
    ownerRole: "warehouse_owner",
    approvalStatus: "draft",
    useLevel: "decision_support",
    definition: {
      ordinaryFamilies: ["family_027", "family_050"],
      safetyAgingFamily: "family_089",
      ordinarySignals: ["库存", "现存量", "库位", "仓库", "近期交易"],
      safetyAgingSignals: ["安全库存", "低于安全", "库龄", "呆滞", "长期未动", "积压"],
      policies: [
        { key: "fifo_age", status: "draft", ownerRole: "warehouse_owner" },
        { key: "transfer", status: "draft", ownerRole: "warehouse_owner" },
        { key: "return", status: "draft", ownerRole: "warehouse_owner" },
        { key: "excluded_warehouses", status: "draft", ownerRole: "warehouse_owner" },
      ],
    },
    evidence: ["apps/server/prisma/migrations/20260710030000_erp_golden_family_fast_paths/migration.sql"],
  },
  {
    assetKey: "job_material.family_076_086",
    assetType: "template_family",
    version: "2026-07-10.assets.v1",
    ownerRole: "production_owner",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      families: ["family_076", "family_086"],
      verifiedTables: ["Erp.JobMtl", "Erp.JobHead", "Erp.JobAsmbl", "Erp.Part"],
      conflictFamilies: ["family_031", "family_006"],
      draftToApprove: ["compile JobMtl/JobAsmbl/ECO fields", "confirm Company scope", "confirm RD job type口径"],
    },
    evidence: ["apps/server/prisma/migrations/20260710030000_erp_golden_family_fast_paths/migration.sql"],
  },
  {
    assetKey: "labor.family_014_092",
    assetType: "template_family",
    version: "2026-07-10.assets.v1",
    ownerRole: "production_owner",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      families: ["family_014", "family_092"],
      allowedTables: ["Erp.LaborDtl", "Erp.JCDept"],
      forbiddenTables: ["Erp.QiMoJob", "Erp.ResourceGroup"],
      forbiddenFields: ["Erp.OpMaster.Void"],
      llmFallbackSchemaEvidencePolicy: "exclude_unconfirmed_tables",
    },
    evidence: ["apps/server/prisma/migrations/20260710030000_erp_golden_family_fast_paths/migration.sql"],
  },
  {
    assetKey: "finance.metric_catalog_scope",
    assetType: "metric",
    version: "2026-07-10.assets.v1",
    ownerRole: "finance_owner",
    approvalStatus: "draft",
    useLevel: "decision_support",
    definition: {
      requiredMetadata: ["metricVersion", "ownerRole", "approvalStatus", "effectiveFrom", "effectiveTo", "grain", "dimensions", "currency", "taxPolicy", "refundPolicy", "costMonthPolicy", "useLevel"],
      exactBoundary: "approved metric/template only",
      estimateDisclaimer: "此数据不准确，仅供参考",
      blockedDimensions: ["supplier_segment", "division", "salesperson"].map((key) => ({ key, status: "draft" })),
    },
    evidence: ["docs/architecture/erp-sql-finance-metrics.md"],
  },
  {
    assetKey: "schema.snapshot_binding",
    assetType: "schema_snapshot",
    version: "2026-07-10.assets.v1",
    ownerRole: "erp_dba",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      requiredFields: ["snapshotId", "capturedAt", "erpVersion", "coverage", "source", "status"],
      freshness: { maxAgeHours: 24, expiredPolicy: "fail_closed", unknownFieldPolicy: "fail_closed" },
      driftSignals: ["missing_table", "missing_field", "type_changed", "coverage_drop"],
      cacheInvalidation: ["snapshot_id_change", "expired_snapshot", "drift_detected"],
    },
    evidence: ["apps/server/src/modules/erpSqlAgent/schema/service/SchemaRetrieverService.ts"],
  },
  {
    assetKey: "api.erp_data_gateway.v1",
    assetType: "api_contract",
    version: "v1",
    ownerRole: "platform_owner",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      agents: ["customer_service", "knowledge_base", "sales", "finance", "production", "inventory", "purchase"],
      directSqlGeneratorAccess: false,
      requiredRequest: ["actor", "purpose", "scope", "mode", "execution", "maxRows", "deadlineMs"],
      requiredResponse: ["status", "confidence", "evidence", "warnings", "traceId", "dataAsOf", "schemaAsOf", "metricVersion", "pageInfo"],
    },
    evidence: ["docs/api/erp-data-gateway.md"],
  },
  {
    assetKey: "pagination.cursor_v1",
    assetType: "api_contract",
    version: "v1",
    ownerRole: "platform_owner",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      pageInfo: ["hasNextPage", "endCursor", "sort", "snapshotId", "cursorSignature"],
      stableSort: ["business_key", "primary_key"],
      cursorSignature: "hmac-sha256",
      nextPagePolicy: "recheck_actor_scope_against_same_snapshot",
      exportPolicy: "no_default_full_export",
    },
    evidence: ["docs/api/erp-data-gateway.md#分页"],
  },
  {
    assetKey: "freshness.response_contract",
    assetType: "api_contract",
    version: "v1",
    ownerRole: "platform_owner",
    approvalStatus: "draft",
    useLevel: "validation_only",
    definition: {
      fields: ["dataAsOf", "schemaAsOf", "metricVersion", "sourceAsOf", "refreshStatus"],
      sourcePolicy: "execution_registry_or_snapshot_only",
      forbiddenSource: "current_time_placeholder",
      appliesTo: ["exact", "estimate", "no_result"],
    },
    evidence: ["docs/api/erp-data-gateway.md#数据新鲜度"],
  },
  {
    assetKey: "audit.rendered_sql_hash",
    assetType: "policy",
    version: "2026-07-10.assets.v1",
    ownerRole: "security_owner",
    approvalStatus: "approved",
    useLevel: "production_exact",
    definition: {
      sqlHash: "rendered_or_final_sql_sha256",
      rawSqlPolicy: "controlled_opt_in_only",
      bindingParams: "name_type_value_hash",
      invalidPublicSql: "",
      terminalStatuses: ["success", "failed", "cancelled", "overloaded", "audit_degraded"],
    },
    evidence: ["apps/server/src/modules/erpSqlAgent/trace/service/SqlTraceService.ts", "docs/architecture/erp-sql-audit-data-protection.md"],
  },
  {
    assetKey: "security.fail_closed_policy",
    assetType: "policy",
    version: "2026-07-10.assets.v1",
    ownerRole: "security_owner",
    approvalStatus: "approved",
    useLevel: "production_exact",
    definition: {
      promptCannotExpandScope: true,
      failClosedCases: ["cross_user", "cross_company", "cross_department", "cross_customer", "sensitive_alias_rename", "mixed_dbo_jcjdy"],
      dlp: ["field_classification", "masked_logs", "external_llm_rows_not_sent"],
    },
    evidence: ["apps/server/src/modules/erpSqlAgent/access/ErpSqlAccessPolicyService.ts", "docs/architecture/erp-sql-access-control.md"],
  },
  {
    assetKey: "cost.llm_budget_v1",
    assetType: "cost_price",
    version: "2026-07-10.CNY.v1",
    ownerRole: "platform_finops",
    approvalStatus: "draft",
    useLevel: "validation_only",
    effectiveFrom: "2026-07-10",
    definition: {
      currency: "CNY",
      requiredUsage: ["promptTokens", "completionTokens", "reasoningTokens", "cachedTokens", "callCount", "provider", "model", "estimatedCost"],
      lifecycle: { notSentCost: 0, templateFastPathTokens: "not_sent" },
      budgetThresholds: [0.7, 0.9, 1],
      hardCapPolicy: "block_or_degrade_at_100_percent",
      priceSource: "configuration_version_not_hardcoded",
    },
    evidence: ["docs/operations/erp-sql-runtime-protection.md"],
  },
];

export const ERP_SQL_PRODUCTION_ASSET_CHECKLIST: ErpSqlProductionAssetItem[] = [
  item(1, "报价/配置资产", "partial", ["family_008/080 semantic signals exist", "JCJDY ProductQuotation scope not proven"], ["contract slot rules", "blocked governed asset until tenant scope proven"], ["positive family_008/080", "negative family_016"], ["sales owner must confirm tenant/Company field"]),
  item(2, "库存资产", "partial", ["family_027/050 and family_089 separated"], ["exclusive ordinary vs safety/aging signals", "draft inventory policies"], ["ordinary/safety/aging/mixed positive-negative"], ["warehouse owner must approve FIFO/transfer/return/excluded warehouses"]),
  item(3, "工单物料资产", "partial", ["family_076 executable template exists", "family_086 remains governance draft"], ["JobMtl/JobAsmbl validation checklist"], ["family_076/086 positive", "family_031/family_006 negative"], ["production owner must approve RD job type and BOM/ECO joins"]),
  item(4, "报工/资源资产", "partial", ["family_014/092 avoid QiMoJob and ResourceGroup templates"], ["forbidden object policy"], ["schema negative for QiMoJob/ResourceGroup/OpMaster.Void"], ["production owner must confirm班组/部门口径"]),
  item(5, "财务资产", "partial", ["approved metrics exist for some strict scopes", "unverified dimensions remain draft"], ["metric metadata requirements", "exact/estimate boundary"], ["metric bridge/grain/currency/tax/refund regression"], ["finance owner must approve费用/供应商段/事业部/销售员等口径"]),
  item(6, "Schema snapshot 资产", "partial", ["schema metadata exists", "snapshot identity not yet runtime-enforced everywhere"], ["snapshot table and freshness policy"], ["freshness/drift fail-closed contract"], ["ERP DBA must provide capture job and ERP version source"]),
  item(7, "版本化接口契约", "partial", ["agentRuntime exists", "public gateway boundary documented"], ["docs/api/erp-data-gateway.md", "business agents cannot call SQL generator directly"], ["contract shape test"], ["platform owner must wire route/SDK if external agents need runtime access"]),
  item(8, "分页资产", "partial", ["maxRows/truncated exists"], ["cursor pageInfo contract and HMAC policy"], ["cursor tamper/same snapshot test contract"], ["executor/template routes need runtime cursor implementation"]),
  item(9, "数据新鲜度资产", "partial", ["trace has schema snapshot version env", "response fields not fully wired"], ["dataAsOf/schemaAsOf/metricVersion contract"], ["exact/estimate/no_result freshness test contract"], ["executor must return real source timestamp or registry snapshot"]),
  item(10, "审计资产", "complete", ["rendered/final SQL hash and protected params exist", "invalid public SQL is empty via runtime guard"], ["reuse SqlTraceService audit_json"], ["audit degraded/failure/cancel terminal tests"], ["keep aligned with P0 audit thread"]),
  item(11, "安全资产", "complete", ["access policy fail-closed and masking exist"], ["unified policy references P0 access service"], ["cross-scope and prompt injection negative tests"], ["needs authoritative org-to-ERP mappings before broader rollout"]),
  item(12, "成本资产", "partial", ["LLM lifecycle metrics exist", "budget hard cap not fully wired"], ["versioned cost price asset and budget policy"], ["not_sent/0 cost and threshold contract tests"], ["FinOps owner must approve price config and daily budgets"]),
];

export const ERP_DATA_GATEWAY_CONTRACT_V1: ErpDataGatewayContract = {
  request: {
    actor: "identity-user-id",
    purpose: "business_question",
    scope: { companies: ["required"], modules: ["required"] },
    mode: "exact",
    execution: "agent",
    maxRows: 100,
    deadlineMs: 30000,
  },
  response: {
    status: "success",
    semanticStatus: "exact",
    confidence: 1,
    evidence: [],
    warnings: [],
    traceId: "uuid",
    schemaAsOf: "schema-snapshot-id",
    pageInfo: {
      hasNextPage: false,
      sort: ["stable-business-key", "primary-key"],
      snapshotId: "schema-snapshot-id",
      cursorSignature: "hmac-sha256",
    },
    sql: "debug_only",
  },
};

export function findGovernedAsset(assetKey: string): ErpGovernedAssetDefinition | undefined {
  return ERP_SQL_GOVERNED_ASSETS.find((asset) => asset.assetKey === assetKey);
}

export function extractContractNo(question: string): string | undefined {
  if (CONTRACT_NUMBER_SLOT_RULES.negativePatterns.some((pattern) => pattern.test(question))) return undefined;
  for (const pattern of CONTRACT_NUMBER_SLOT_RULES.positivePatterns) {
    const match = pattern.exec(question);
    if (match?.[1]) return match[1].slice(0, CONTRACT_NUMBER_SLOT_RULES.binding.maxLength);
  }
  return undefined;
}

function item(
  id: number,
  title: string,
  status: ErpAssetStatus,
  facts: string[],
  implementation: string[],
  tests: string[],
  dependencies: string[],
): ErpSqlProductionAssetItem {
  return { id, title, status, facts, implementation, tests, dependencies };
}
