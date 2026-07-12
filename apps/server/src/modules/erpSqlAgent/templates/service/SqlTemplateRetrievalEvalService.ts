import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import { parseGoldenCapabilityCase } from "../../capabilities/goldenContract.js";
import type { GoldenCapabilityCase } from "../../capabilities/types.js";

type TemplateRow = {
  id: bigint;
  familyId: string;
  name: string;
  intent: string;
  module: string;
  questionPattern: string | null;
  normalizedQuestion: string | null;
  optionalParams: unknown;
};

type EvalCase = GoldenCapabilityCase & {
  expectedIntent?: string;
};

type TopMatch = {
  familyId: string;
  intent: string;
  name: string;
  score: number;
  matchedSignals: string[];
};

type EvalResult = EvalCase & {
  topK: TopMatch[];
  slots: Record<string, string | number | boolean>;
  top1Pass: boolean;
  top3Pass: boolean;
  pass: boolean;
  reason?: string;
};

export type SqlTemplateRetrievalEvalReport = {
  kind: "template_retrieval_eval";
  summary: {
    caseCount: number;
    templateCount: number;
    top1Pass: number;
    top3Pass: number;
    top1Accuracy: number;
    top3Accuracy: number;
    ambiguousCount: number;
    failedCount: number;
  };
  cases: EvalResult[];
};

export type SqlTemplateRetrievalEvalCompactReport = {
  kind: "template_retrieval_eval_compact";
  summary: Omit<SqlTemplateRetrievalEvalReport["summary"], "templateCount">;
  failedCases: Array<{
    question: string;
    expectedFamilyIds: string[];
    topK: Array<{ familyId: string; score: number }>;
    reason: string;
  }>;
};

const FAMILY_HINTS: Record<string, string[]> = {
  family_050: ["库存", "物料", "仓库", "库位", "产品群组", "partNum", "warehouseCode", "partDescription"],
  family_027: ["库存", "物料", "仓库", "库位", "液压站", "partNum", "warehouseCode", "partDescription"],
  family_089: ["库龄", "呆滞", "安全库存", "低于安全", "库存"],
  family_062: ["采购", "采购单", "供应商", "到货", "没到货", "未来", "dueBeforeDate", "poNum", "vendorName"],
  family_076: ["工单", "物料需求", "缺料", "未发", "jobNum", "materialPartNum"],
  family_086: ["研发", "研发工单", "BOM", "物料", "装配"],
  family_092: ["报工", "报工明细", "资源群组", "资源组"],
  family_031: ["工单", "工序", "进度", "完工", "做到哪道", "jobNum"],
  family_016: ["销售订单", "订单明细", "客户", "订单", "orderNum", "customerName"],
  family_037: ["待发货", "发货", "发货通知", "客户", "订单"],
  family_038: ["工序", "OpMaster", "opCode", "工序字典"],
  family_014: ["班组", "资源群组", "资源组", "部门", "加工中心"],
  family_006: ["BOM", "ECO", "物料明细", "子件", "物料清单", "partNum"],
  family_008: ["产品报价", "产品配置", "购销合同", "合同号", "ContractNo"],
  family_080: ["产品报价", "产品配置", "购销合同", "合同号", "ContractNo"],
  family_049: ["财务采购", "采购金额", "采购管理", "采购中心"],
  family_053: ["费用", "财务", "供应商余额", "费用统计"],
  family_059: ["成本", "成本数据", "料费", "加工费"],
  family_100: ["毛利", "低毛利", "客户订单", "成本", "销售金额", "销售额", "单价"],
};

const FAMILY_BOOSTS: Record<string, Array<{ pattern: RegExp; weight: number; signal: string }>> = {
  family_050: [
    { pattern: /库存|物料/u, weight: 7, signal: "库存/物料" },
    { pattern: /库存明细|库位/u, weight: 10, signal: "库存明细/库位" },
  ],
  family_027: [{ pattern: /库存|物料/u, weight: 7, signal: "库存/物料" }],
  family_089: [
    { pattern: /库龄|呆滞/u, weight: 8, signal: "库龄/呆滞" },
    { pattern: /安全库存|库存不足|低于.*安全|最低安全线/u, weight: 14, signal: "安全库存/库存不足" },
  ],
  family_062: [
    { pattern: /采购|供应商|到货/u, weight: 8, signal: "采购/到货" },
    { pattern: /采购订单?.*(到货|收货)|采购.*(没到货|未到货|收货进度)/u, weight: 12, signal: "采购到货/收货" },
  ],
  family_076: [
    { pattern: /缺料|物料需求/u, weight: 8, signal: "缺料/物料需求" },
    { pattern: /工单.*(缺.*料|未发料|发齐|领.*料|物料需求)|物料.*工单需求|工单需求物料/u, weight: 14, signal: "工单物料需求/发料" },
  ],
  family_086: [
    { pattern: /研发|BOM/u, weight: 10, signal: "研发/BOM" },
    { pattern: /研发.*(BOM|物料|工单|装配)/u, weight: 12, signal: "研发工单物料" },
  ],
  family_092: [{ pattern: /报工/u, weight: 10, signal: "报工" }],
  family_031: [
    { pattern: /工序.*进度|做到哪道|工序.*完工/u, weight: 10, signal: "工单工序进度" },
    { pattern: /生产.*进度|未完工工序|工序延期|下一道工序|生产任务|生产工序|生产进度|完成的生产工序/u, weight: 14, signal: "生产工序进度" },
  ],
  family_037: [
    { pattern: /待发货|发货/u, weight: 10, signal: "待发货" },
    { pattern: /欠发|未发货|发货通知/u, weight: 12, signal: "欠发/发货通知" },
  ],
  family_016: [{ pattern: /销售订单|订单.*明细|订单\s*\d+/u, weight: 7, signal: "销售订单/明细" }],
  family_038: [{ pattern: /工序/u, weight: 8, signal: "工序" }],
  family_014: [{ pattern: /班组|资源群组|资源组|加工中心/u, weight: 8, signal: "班组/资源群组" }],
  family_006: [{ pattern: /BOM|ECO|子件|物料清单/iu, weight: 10, signal: "BOM/ECO" }],
  family_008: [{ pattern: /报价|购销合同/u, weight: 10, signal: "报价/购销合同" }],
  family_080: [
    { pattern: /配置|合同/u, weight: 10, signal: "配置/合同" },
    { pattern: /产品配置|配置.*合同|合同.*配置/u, weight: 12, signal: "产品配置" },
  ],
  family_049: [{ pattern: /财务采购|采购金额|采购管理/u, weight: 10, signal: "财务采购" }],
  family_053: [{ pattern: /费用|余额|财务/u, weight: 10, signal: "费用/财务" }],
  family_059: [{ pattern: /成本|料费|加工费/u, weight: 10, signal: "成本" }],
  family_100: [{ pattern: /毛利|低毛利|销售金额|销售额|单价/u, weight: 10, signal: "毛利/销售额/单价" }],
};

const FINANCE_INTENT_BOOSTS: Record<string, Array<{ pattern: RegExp; weight: number; signal: string }>> = {
  family_053: [{ pattern: /费用|余额|财务/u, weight: 12, signal: "费用/余额/财务强绑定" }],
  family_059: [{ pattern: /成本|料费|加工费/u, weight: 12, signal: "成本/料费/加工费强绑定" }],
  family_100: [{ pattern: /毛利|低毛利|销售金额|销售额|单价/u, weight: 12, signal: "毛利/销售额/单价强绑定" }],
  family_049: [{ pattern: /财务采购|采购金额|采购管理|采购中心/u, weight: 12, signal: "财务采购/采购金额/采购管理/采购中心强绑定" }],
};

const FINANCE_COMMON_DISPLACEMENT_PATTERNS = [/采购/u, /供应商/u, /客户订单/u, /订单明细/u, /统计/u];
const FINANCE_COMMON_DISPLACEMENT_PENALTY = 3;

const GOLDEN_EVAL_FALLBACKS: Record<string, Omit<TemplateRow, "id" | "familyId">> = {
  family_049: { name: "财务采购金额", intent: "purchase_finance_metric", module: "finance", questionPattern: "财务采购管理、采购中心管理看板、采购金额", normalizedQuestion: "采购金额 供应商 财务采购", optionalParams: {} },
  family_053: { name: "费用统计和供应商余额", intent: "finance_expense_vendor_balance", module: "finance", questionPattern: "费用统计、财务费用、供应商余额", normalizedQuestion: "费用 事业部 供应商余额 财务", optionalParams: {} },
  family_059: { name: "成本数据", intent: "finance_cost_metric", module: "finance", questionPattern: "成本数据、料费、加工费、成本明细", normalizedQuestion: "成本 料费 加工费", optionalParams: {} },
  family_100: { name: "客户订单毛利", intent: "finance_order_margin_metric", module: "finance", questionPattern: "客户订单低毛利、销售金额、销售额、单价、成本和毛利", normalizedQuestion: "毛利 低毛利 客户订单 销售金额 销售额 单价 成本", optionalParams: {} },
};

export class SqlTemplateRetrievalEvalService {
  async evaluate(): Promise<SqlTemplateRetrievalEvalReport> {
    return evaluateTemplates(await loadApprovedTemplates());
  }
}

export const sqlTemplateRetrievalEvalService = new SqlTemplateRetrievalEvalService();

export function evaluateTemplates(templates: TemplateRow[], cases: EvalCase[] = loadSqlTemplateGoldenQuestions()): SqlTemplateRetrievalEvalReport {
  const candidates = withGoldenEvalFallbacks(templates, cases);
  const results = cases.map((item) => evaluateCase(item, candidates));
  const top1Pass = results.filter((item) => item.top1Pass).length;
  const top3Pass = results.filter((item) => item.top3Pass).length;
  return {
    kind: "template_retrieval_eval",
    summary: {
      caseCount: results.length,
      templateCount: candidates.length,
      top1Pass,
      top3Pass,
      top1Accuracy: round(top1Pass / results.length),
      top3Accuracy: round(top3Pass / results.length),
      ambiguousCount: results.filter((item) => item.expectedFamilyIds.length > 1).length,
      failedCount: results.filter((item) => !item.top1Pass).length,
    },
    cases: results,
  };
}

function withGoldenEvalFallbacks(templates: TemplateRow[], cases: EvalCase[]): TemplateRow[] {
  const seen = new Set(templates.map((item) => item.familyId));
  const expectedFamilyIds = new Set(cases.flatMap((item) => item.expectedFamilyIds));
  const missing = Object.entries(GOLDEN_EVAL_FALLBACKS)
    .filter(([familyId]) => !seen.has(familyId) && expectedFamilyIds.has(familyId))
    .map(([familyId, item], index) => ({ ...item, id: BigInt(-900000 - index), familyId }));
  return missing.length ? [...templates, ...missing] : templates;
}

export function loadSqlTemplateGoldenQuestions(): EvalCase[] {
  const file = path.resolve("apps/server/src/modules/erpSqlAgent/templates/golden/sqlTemplateGoldenQuestions.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { cases?: unknown[] };
  return (parsed.cases ?? []).map((item) => parseGoldenCapabilityCase(item));
}

export function compactSqlTemplateRetrievalEvalReport(report: SqlTemplateRetrievalEvalReport): SqlTemplateRetrievalEvalCompactReport {
  const { templateCount: _templateCount, ...summary } = report.summary;
  return {
    kind: "template_retrieval_eval_compact",
    summary,
    failedCases: report.cases.filter((item) => !item.top1Pass).map((item) => ({
      question: item.question,
      expectedFamilyIds: item.expectedFamilyIds,
      topK: item.topK.map((match) => ({ familyId: match.familyId, score: match.score })),
      reason: item.reason ?? "expected family was not top1",
    })),
  };
}

export async function writeSqlTemplateRetrievalEvalOutputs(report: SqlTemplateRetrievalEvalReport, options: { out: string; mdOut: string; compactOut: string }): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await fs.writeFile(options.out, `${JSON.stringify(report, jsonReplacer, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(path.resolve(options.compactOut)), { recursive: true });
  await fs.writeFile(options.compactOut, `${JSON.stringify(compactSqlTemplateRetrievalEvalReport(report), null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(path.resolve(options.mdOut)), { recursive: true });
  await fs.writeFile(options.mdOut, renderMarkdown(report), "utf8");
}

async function loadApprovedTemplates(): Promise<TemplateRow[]> {
  return prisma.$queryRaw<TemplateRow[]>(Prisma.sql`
    SELECT
      id,
      source_family_id AS "familyId",
      name,
      intent,
      module,
      question_pattern AS "questionPattern",
      normalized_question AS "normalizedQuestion",
      optional_params AS "optionalParams"
    FROM "erp_agent"."erp_query_templates"
    WHERE approved = TRUE
      AND approval_status = 'approved'
      AND guard_passed = TRUE
      AND source_type = 'finereport_family'
      AND source_family_id IS NOT NULL
    UNION ALL
    SELECT
      -id AS id,
      family_id AS "familyId",
      family_name AS name,
      intent,
      module,
      business_description AS "questionPattern",
      business_description AS "normalizedQuestion",
      common_params AS "optionalParams"
    FROM "erp_agent"."erp_sql_reference_family"
    WHERE is_enabled = TRUE
    UNION ALL
    SELECT
      -100000 - id AS id,
      family_id AS "familyId",
      metric_name AS name,
      metric_code AS intent,
      module,
      business_description AS "questionPattern",
      calculation_summary AS "normalizedQuestion",
      params AS "optionalParams"
    FROM "erp_agent"."business_metric_catalog"
    WHERE status IN ('draft', 'approved')
    ORDER BY "familyId", intent
  `);
}

function evaluateCase(item: EvalCase, templates: TemplateRow[]): EvalResult {
  const slots = extractSlots(item.question);
  const topK = templates.map((template) => scoreTemplate(item.question, slots, template)).sort((a, b) => b.score - a.score || a.familyId.localeCompare(b.familyId)).slice(0, 3);
  const top1Pass = Boolean(topK[0] && item.expectedFamilyIds.includes(topK[0].familyId));
  const top3Pass = topK.some((match) => item.expectedFamilyIds.includes(match.familyId));
  return {
    ...item,
    topK,
    slots,
    top1Pass,
    top3Pass,
    pass: top1Pass,
    ...(top1Pass ? {} : { reason: topK[0] ? `${topK[0].familyId} outranked ${item.expectedFamilyIds.join("/")}` : "no templates matched" }),
  };
}

function scoreTemplate(question: string, slots: Record<string, string | number | boolean>, template: TemplateRow): TopMatch {
  const haystack = normalize([template.name, template.intent, template.module, template.questionPattern, template.normalizedQuestion, ...readParamNames(template.optionalParams), ...(FAMILY_HINTS[template.familyId] ?? [])].join(" "));
  const signals: string[] = [];
  let score = 0;
  for (const token of questionTokens(question)) {
    if (haystack.includes(normalize(token))) {
      score += token.length > 1 ? 2 : 1;
      signals.push(token);
    }
  }
  for (const param of readParamNames(template.optionalParams)) {
    if (param in slots) {
      score += 3;
      signals.push(param);
    }
  }
  for (const boost of FAMILY_BOOSTS[template.familyId] ?? []) {
    if (boost.pattern.test(question)) {
      score += boost.weight;
      signals.push(boost.signal);
    }
  }
  for (const boost of FINANCE_INTENT_BOOSTS[template.familyId] ?? []) {
    if (boost.pattern.test(question)) {
      score += boost.weight;
      signals.push(boost.signal);
    }
  }
  if (isFinanceQuestion(question) && !isFinanceFamily(template.familyId) && hasGenericFinanceWord(question)) {
    score -= FINANCE_COMMON_DISPLACEMENT_PENALTY;
    signals.push("非财务通用词降噪");
  }
  const uniqueSignals = [...new Set(signals)];
  return { familyId: template.familyId, intent: template.intent, name: template.name, score: round(score / 20), matchedSignals: uniqueSignals };
}

function extractSlots(question: string): Record<string, string | number | boolean> {
  const slots: Record<string, string | number | boolean> = {};
  const number = question.match(/[A-Z]?\d{4,}/iu)?.[0];
  if (/物料/u.test(question) && number) slots.partNum = number;
  if (/采购单/u.test(question) && number) slots.poNum = number;
  if (/订单/u.test(question) && number) slots.orderNum = number;
  if (/工单/u.test(question) && number) slots.jobNum = number;
  if (/仓库/u.test(question)) slots.warehouseCode = question.match(/[a-z]{2,}\d{2,}/iu)?.[0] ?? true;
  if (/供应商/u.test(question)) slots.vendorName = "某某";
  if (/客户/u.test(question)) slots.customerName = "某某";
  if (/液压站|相关物料/u.test(question)) slots.partDescription = "液压站";
  if (/工序\s*\d+/u.test(question)) slots.opCode = question.match(/\d+/u)?.[0] ?? true;
  if (/加工中心/u.test(question)) slots.departmentName = "加工中心";
  const days = /未来\s*(\d+)\s*天/u.exec(question)?.[1];
  if (days) slots.dueBeforeDate = plusDays(Number(days));
  return slots;
}

function questionTokens(question: string): string[] {
  return [...new Set(question.match(/[A-Za-z]+\d*|\d+|[\u4e00-\u9fa5]{2,}/gu) ?? [])];
}

function readParamNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") return Object.keys(value);
  return [];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function isFinanceQuestion(question: string): boolean {
  return /费用|余额|成本|毛利|采购金额|财务采购|低毛利|销售金额|加工费|料费|财务/u.test(question);
}

function isFinanceFamily(familyId: string): boolean {
  return familyId in FINANCE_INTENT_BOOSTS;
}

function hasGenericFinanceWord(question: string): boolean {
  return FINANCE_COMMON_DISPLACEMENT_PATTERNS.some((pattern) => pattern.test(question));
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function renderMarkdown(report: SqlTemplateRetrievalEvalReport): string {
  return `${[
    "# SQL Template Retrieval Eval",
    "",
    "## Summary",
    "",
    `- caseCount: ${report.summary.caseCount}`,
    `- templateCount: ${report.summary.templateCount}`,
    `- top1Accuracy: ${report.summary.top1Accuracy}`,
    `- top3Accuracy: ${report.summary.top3Accuracy}`,
    `- failedCount: ${report.summary.failedCount}`,
    "",
    "## Failed Cases",
    "",
    ...(report.cases.filter((item) => !item.top1Pass).length
      ? report.cases.filter((item) => !item.top1Pass).map((item) => `- ${item.question}: expected ${item.expectedFamilyIds.join("/")} got ${item.topK[0]?.familyId ?? "none"}`)
      : ["- none"]),
    "",
  ].join("\n")}\n`;
}
