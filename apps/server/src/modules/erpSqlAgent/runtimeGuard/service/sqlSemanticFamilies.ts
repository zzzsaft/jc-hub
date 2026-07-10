import type { SqlReferenceHint } from "../../generator/index.js";
import type { AnalysisPlan, QueryPlan } from "../../planner/index.js";
import type { FinanceSqlMode } from "../../sqlGuard/index.js";
import type { SqlSemanticGuardResult } from "../types/SqlRuntimeGuardTypes.js";

type SemanticReference = {
  familyId: string;
  sourceType?: string;
  metricCode?: string;
};

const BUSINESS_TYPE_FAMILIES: Record<string, string[]> = {
  inventory_material: ["family_027", "family_050", "family_089"],
  production_task_progress: ["family_031"],
  job_material_bom: ["family_006", "family_076", "family_086"],
  operation_labor: ["family_014", "family_038", "family_092"],
  quotation_config: ["family_008", "family_080"],
  finance_cost_margin: ["family_049", "family_053", "family_059", "family_100"],
};

const METRIC_FAMILIES: Record<string, string[]> = {
  order_amount: ["family_100"],
  finance_revenue: ["family_100"],
  invoice_revenue: ["family_100"],
  gross_margin_rate: ["family_100"],
  gross_margin_amount: ["family_100"],
  collection_delay_days: ["family_100"],
  collection_overdue_amount: ["family_100"],
  material_cost_amount: ["family_059"],
  labor_cost_amount: ["family_059"],
  burden_cost_amount: ["family_059"],
  subcontract_cost_amount: ["family_059"],
  cost_component_amount: ["family_059"],
  open_shipping_amount: ["family_037"],
  open_shipping_qty: ["family_037"],
  shipped_amount: ["family_037"],
  inventory_on_hand_qty: ["family_027", "family_050"],
  purchase_amount: ["family_049"],
  open_job_margin_cost_risk: ["family_031"],
  product_margin_cost_ratio_top5: ["family_100", "family_059"],
};

export function evaluateSqlSemantic(input: {
  question: string;
  sql: string;
  references?: SqlReferenceHint[];
  queryPlan?: QueryPlan;
  analysisPlan?: AnalysisPlan;
  financeMode?: FinanceSqlMode;
  lowConfidence?: boolean;
  source?: string;
}): SqlSemanticGuardResult {
  const expectedMetricCodes = uniqueStrings([
    ...(input.analysisPlan?.requiredMetrics ?? []),
    ...(input.analysisPlan?.metrics ?? []),
  ]);
  const expectedFamilyGroups = expectedMetricCodes.length > 0
    ? uniqueGroups(expectedMetricCodes.map((metric) => METRIC_FAMILIES[metric] ?? []).filter((group) => group.length > 0))
    : inferQuestionFamilyGroups(input.question, input.references?.length ? undefined : input.queryPlan);
  const governedReferences = (input.references ?? []).filter((reference) =>
    reference.sourceType === "metric" || (input.source === "template" && reference.sourceType === "template")
  );
  const actualMetricCodes = uniqueStrings(governedReferences.flatMap((reference) => reference.metricCode ? [reference.metricCode] : []));
  const rawReferenceFamilyIds = governedReferences.map((reference) => reference.familyId).filter(Boolean);
  const referenceFamilyIds = uniqueStrings(rawReferenceFamilyIds.flatMap(normalizeFamilyId));
  const metricFamilyIds = uniqueStrings(actualMetricCodes.flatMap((metric) => METRIC_FAMILIES[metric] ?? []));
  const actualFamilyIds = uniqueStrings([
    ...rawReferenceFamilyIds,
    ...referenceFamilyIds,
    ...metricFamilyIds,
    ...inferSqlFamilies(input.sql, input.queryPlan),
  ]);
  const missingMetrics = expectedMetricCodes.filter((metric) => {
    if (actualMetricCodes.includes(metric)) return false;
    const families = METRIC_FAMILIES[metric] ?? [];
    return families.length > 0 && !families.some((family) => actualFamilyIds.includes(family));
  });
  const missingGroups = expectedFamilyGroups.filter((group) => !group.some((family) => actualFamilyIds.includes(family)));
  const errors = missingMetrics.length > 0 || missingGroups.length > 0
    ? [semanticMismatchMessage(expectedFamilyGroups, actualFamilyIds, expectedMetricCodes, actualMetricCodes)]
    : [];
  const estimate = input.financeMode === "estimate" || input.lowConfidence === true;
  return {
    valid: errors.length === 0,
    status: errors.length > 0 ? "semantic_mismatch" : estimate ? "estimate" : "exact",
    errors,
    expectedFamilyGroups,
    expectedFamilyIds: uniqueStrings(expectedFamilyGroups.flat()),
    actualFamilyIds,
    expectedMetricCodes,
    actualMetricCodes,
  };
}

export function semanticMismatchError(
  businessType: string | undefined,
  expectedFamilyIds: string[],
  references: SemanticReference[],
): string | undefined {
  if (expectedFamilyIds.length === 0) return undefined;
  const actualFamilyIds = uniqueStrings(references.map((reference) => reference.familyId));
  if (actualFamilyIds.some((familyId) => expectedFamilyIds.includes(familyId))) return undefined;
  if (actualFamilyIds.length === 0 && businessType && expectedFamilyIds.some((familyId) => BUSINESS_TYPE_FAMILIES[businessType]?.includes(familyId))) return undefined;
  if (businessType === "business_decision_composite" && references.some((reference) => reference.sourceType === "metric")) return undefined;
  if (references.some((reference) => metricMatchesExpectedFamily(reference, expectedFamilyIds))) return undefined;
  return `semantic_mismatch: expected ${expectedFamilyIds.join("/")} got ${actualFamilyIds.join("/") || "none"}`;
}

export function metricMatchesExpectedFamily(reference: SemanticReference, expectedFamilyIds: string[]): boolean {
  if (reference.sourceType !== "metric" || !reference.metricCode) return false;
  return (METRIC_FAMILIES[reference.metricCode] ?? []).some((family) => expectedFamilyIds.includes(family));
}

function inferQuestionFamilyGroups(question: string, plan?: QueryPlan): string[][] {
  const groups: string[][] = [];
  const add = (...families: string[]) => groups.push(families);

  if (/产品配置|配置合同|合同.*配置|配置.*合同/u.test(question)) add("family_080");
  if (/产品报价|报价明细|报价合同|合同.*报价|报价.*合同/u.test(question)) add("family_008");
  if (/费用|供应商.*余额|余额表/u.test(question)) add("family_053");
  if (/财务采购|采购金额|采购额|采购中心.*金额/u.test(question)) add("family_049");
  if (/材料成本|人工成本|制造成本|外协成本|成本明细|成本项目|料费|加工费/u.test(question)) add("family_059");
  if (/毛利|销售金额|销售额|订单金额|收入/u.test(question)) add("family_100");
  if (/发货通知|待发货|未发货|欠发|欠交|未交付/u.test(question)) add("family_037");
  if (/采购.*(?:到货|收货|延期|未到货)|供应商.*(?:到货|未到货)/u.test(question)) add("family_062");
  else if (/采购订单/u.test(question) && !/采购金额|采购额|采购成本/u.test(question)) add("family_062");
  if (/研发工单.*(?:物料|bom|未发料)|(?:物料|bom).*研发工单/iu.test(question)) add("family_086");
  else if (/(?:工单.*(?:缺料|物料需求|未发料|领.*料|没发齐|还要.*料))|(?:(?:缺料|物料需求).*工单)/u.test(question)) add("family_076");
  else if (/\bbom\b|eco|子件|物料清单/iu.test(question)) add("family_006");
  if (/报工|员工.*工时|资源组.*报工/u.test(question)) add("family_092");
  else if (/工单.*(?:工序|进度|完工)|未完工工单/u.test(question)) add("family_031");
  else if (/工序.*(?:字典|代码|描述|名称|主数据|资料)|有哪些工序|查.*工序|opmaster/iu.test(question)) add("family_038");
  else if (/部门.*(?:班组|资源)|班组.*资源|资源群组.*部门|资源组.*部门/u.test(question)) add("family_014");
  if (/安全库存|库龄|呆滞|长期未动|积压/u.test(question)) add("family_089");
  else if (/库存/u.test(question)) add("family_027", "family_050");
  if (/销售订单|客户订单/u.test(question)
    && !/发货通知|待发货|未发货|欠发|欠交|未交付/u.test(question)
    && !/毛利|销售金额|销售额|订单金额|收入|成本/u.test(question)) add("family_016");

  if (groups.length === 0) {
    const scenarioFamilies: Partial<Record<QueryPlan["scenario"], string[]>> = {
      purchaseSpendByType: ["family_049"],
      purchaseDelayVendor: ["family_062"],
      purchaseDetail: ["family_062", "family_049"],
      openJob: ["family_031"],
      inventoryBalance: ["family_027", "family_050"],
      recentInventoryTran: ["family_050"],
      salesBackorder: ["family_037"],
    };
    const families = plan && scenarioFamilies[plan.scenario];
    if (families) add(...families);
  }
  return uniqueGroups(groups);
}

function inferSqlFamilies(sql: string, plan?: QueryPlan): string[] {
  const families: string[] = [];
  const add = (...items: string[]) => families.push(...items);
  if (/\b(?:PartWhse|PartBin)\b/iu.test(sql)) add("family_027", "family_050");
  if (/\bPartTran\b/iu.test(sql)) add("family_050", "family_059");
  if (/\bJobOper\b/iu.test(sql)) add("family_031");
  if (/\bJobMtl\b/iu.test(sql)) add("family_076", "family_086");
  if (/\b(?:ECOMtl|ECORev)\b/iu.test(sql)) add("family_006");
  if (/\bLaborDtl\b/iu.test(sql)) add("family_092");
  if (/\bOpMaster\b/iu.test(sql)) add("family_038");
  if (/\bJCDept\b/iu.test(sql)) add("family_014");
  if (/\bOrderRel\b/iu.test(sql)) add("family_037");
  if (/\b(?:OrderHed|OrderDtl)\b/iu.test(sql)) add("family_016", "family_100");
  if (/\b(?:POHeader|PODetail|PORel)\b/iu.test(sql)) add("family_049", "family_062");
  if (/\bProductQuotationDetail\b/iu.test(sql)) add("family_008");
  if (/\bProductQuotation\b/iu.test(sql)) add("family_080");
  if (/\b(?:GLJrnDtl|APInvHed|APInvDtl)\b/iu.test(sql)) add("family_053");
  if (/\bPart\b/iu.test(sql) && !families.length) add("family_027", "family_050");
  if (!families.length && plan) families.push(...inferQuestionFamilyGroups("", plan).flat());
  return uniqueStrings(families);
}

function semanticMismatchMessage(
  expectedGroups: string[][],
  actualFamilies: string[],
  expectedMetrics: string[],
  actualMetrics: string[],
): string {
  const expected = expectedGroups.map((group) => group.join("|")).join("+") || "none";
  return `semantic_mismatch: expected families ${expected}; actual families ${actualFamilies.join("/") || "none"}; expected metrics ${expectedMetrics.join("/") || "none"}; actual metrics ${actualMetrics.join("/") || "none"}`;
}

function uniqueGroups(groups: string[][]): string[][] {
  const seen = new Set<string>();
  return groups
    .map((group) => uniqueStrings(group).sort())
    .filter((group) => {
      const key = group.join("|");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFamilyId(familyId: string): string[] {
  if (familyId === "finance_income") return [familyId, "family_100"];
  return [familyId];
}
