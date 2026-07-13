import { auditHash, classifyError } from "../../../ai/audit/dataProtection.js";
import type { SqlTraceStage } from "./types/SqlTraceTypes.js";

export type SqlFailureDiagnostic = {
  failureStage: SqlTraceStage;
  failureCode: string;
  retryable: boolean;
  recommendedActions: string[];
  safeEvidence: { errorCategory: string; messageHash: string };
};

export function diagnoseSqlFailure(stage: SqlTraceStage, error: unknown): SqlFailureDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const failure = failureRule(message);
  return {
    failureStage: stage,
    failureCode: failure.code,
    retryable: failure.retryable,
    recommendedActions: failure.actions,
    safeEvidence: { errorCategory: classifyError(error), messageHash: auditHash(message) },
  };
}

function failureRule(message: string): { code: string; retryable: boolean; actions: string[] } {
  if (/abort|cancel/iu.test(message)) {
    return { code: "cancelled", retryable: true, actions: ["确认网络连接后重新提交查询。", "如多次取消，缩小查询范围后重试。"] };
  }
  if (/ERP_SQL_ACCESS_DENIED|forbidden|permission|unauthorized/iu.test(message)) {
    return { code: "access_denied", retryable: false, actions: ["确认已获 ERP SQL 查询权限。", "确认 Company、模块及敏感字段数据范围已配置。"] };
  }
  if (/semantic_mismatch/iu.test(message)) {
    return { code: "semantic_mismatch", retryable: false, actions: ["补充业务口径、时间范围或统计对象。", "改用与问题匹配的已审批模板或指标。"] };
  }
  if (/blocked_missing_metric|approved business metric|approved SQL template/iu.test(message)) {
    return { code: "metric_or_template_missing", retryable: false, actions: ["选择现有已审批业务口径。", "申请补充或审批对应指标、SQL 模板。"] };
  }
  if (/guard|invalid sql|schema validation|schema.*field|schema.*table/iu.test(message)) {
    return { code: "sql_guard_rejected", retryable: false, actions: ["补充日期、公司或业务范围，缩小查询歧义。", "检查目标表和字段是否已进入 schema 索引。"] };
  }
  if (/timeout|deadline|slow/iu.test(message)) {
    return { code: "erp_timeout", retryable: true, actions: ["缩小时间范围、结果行数或筛选条件后重试。", "稍后重试，并检查 ERP 查询服务状态。"] };
  }
  if (/overloaded|queue is full|\b429\b/iu.test(message)) {
    return { code: "erp_overloaded", retryable: true, actions: ["稍后重试。", "缩小查询范围以减少执行压力。"] };
  }
  return { code: "execution_failed", retryable: false, actions: ["查看失败阶段与安全证据，确认输入口径。", "如持续失败，提交 Trace ID 给管理员排查。"] };
}
