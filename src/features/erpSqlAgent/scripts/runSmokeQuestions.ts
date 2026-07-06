import "../../../config/env.js";

import { erpSqlAgentService } from "../agent/index.js";
import { prisma } from "../../../lib/prisma.js";

const DEFAULT_QUESTIONS = [
  "我现在想查看公司近三年的采购额，以及采购类型比例，比如钢材占采购额多少",
  "查询物料 A123 的库存",
  "查看最近30天物料 A123 的库存交易明细",
  "统计延期采购供应商排名",
  "查询采购订单 1001 的明细",
  "查询未完工工单列表",
  "统计最近一年销售欠交订单",
  "查询客户 1001 的销售订单明细",
  "查看供应商 2001 最近一年的采购金额",
  "统计今年每个月采购订单数量趋势",
];

type SmokeResult = {
  question: string;
  success: boolean;
  traceId?: string;
  sql?: string;
  rowCount: number;
  previewRows?: Array<Record<string, unknown>>;
  errorMessage?: string;
  warnings: string[];
};

async function main(): Promise<void> {
  const questions = process.argv.slice(2).map((item) => item.trim()).filter(Boolean);
  const smokeQuestions = questions.length > 0 ? questions : DEFAULT_QUESTIONS;
  const results: SmokeResult[] = [];

  for (const question of smokeQuestions) {
    const result = await askOne(question);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const successCount = results.filter((result) => result.success).length;
  console.log(JSON.stringify({
    total: results.length,
    successCount,
    failedCount: results.length - successCount,
  }, null, 2));
}

async function askOne(question: string): Promise<SmokeResult> {
  try {
    const result = await erpSqlAgentService.ask(question);
    return {
      question,
      success: result.success,
      traceId: result.traceId,
      sql: result.sql,
      rowCount: result.execution?.rowCount ?? 0,
      previewRows: toObjects(result.execution?.fields ?? [], result.execution?.rows.slice(0, 10) ?? []),
      errorMessage: result.error,
      warnings: result.warnings,
    };
  } catch (error) {
    return {
      question,
      success: false,
      rowCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
      warnings: [],
    };
  }
}

function toObjects(fields: string[], rows: unknown[][]): Array<Record<string, unknown>> {
  return rows.map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
