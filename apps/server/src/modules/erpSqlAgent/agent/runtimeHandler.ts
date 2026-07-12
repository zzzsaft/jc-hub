import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { erpSqlAgentService } from "./index.js";
import { ERP_SQL_AGENT_SCOPE_ERROR, isErpSqlAgentQuestion } from "./domain.js";
import { resultNarratorService, type ResultNarration } from "./service/ResultNarratorService.js";
import type { ErpSqlCustomerCandidate, ErpSqlCustomerClarification } from "./types/ErpSqlAgentTypes.js";
import { erpSqlAccessPolicyService, requireErpSqlAccessScope } from "../access/index.js";
import { buildResultColumns } from "./resultColumnMetadata.js";

export const agentRuntimeErpSqlHandler: AgentRuntimeAgentHandler = {
  agentType: "erpSqlAgent",
  authorize: (ownerUserId) => erpSqlAccessPolicyService.resolve(ownerUserId),
  async createPlan(options) {
    return {
      intent: "erp_sql_query",
      steps: [{ id: "erp_sql_ask", tool: "erpSqlAgent.ask", args: { question: options.message } }],
      question: options.message,
    };
  },
  async executePlan(input) {
    const accessScope = requireErpSqlAccessScope(input.authorizationContext, input.ownerUserId);
    const clarification = readCustomerClarification(input.options.context);
    const selectedCustomer = clarification ? selectCustomerCandidate(input.options.message, clarification.candidates) : undefined;
    if (clarification && !selectedCustomer) return customerClarificationResponse(input.options.message, clarification);
    const resolvedQuestion = clarification && selectedCustomer
      ? replaceFirst(clarification.originalQuestion, clarification.keyword, selectedCustomer.customerName)
      : undefined;
    const question = resolvedQuestion ?? input.options.message;
    if (!isErpSqlAgentQuestion(question)) return outOfScopeResponse(question, input.options.message);
    const step = input.plan.steps?.[0] ?? { id: "erp_sql_ask", tool: "erpSqlAgent.ask", args: { question } };
    step.args = { ...step.args, question };
    const startedAt = Date.now();
    await input.onToolStart({ step });
    try {
      const result = await erpSqlAgentService.ask(question, {
        sessionId: input.sessionId,
        runId: input.runId,
        ownerUserId: input.ownerUserId,
        accessScope,
        signal: input.options.signal,
      });
      await input.onToolFinish({ step, result, durationMs: Date.now() - startedAt });
      const context = toRuntimeContext(result);
      const analysis = await narrateResult(question, result, context, input.options.signal);
      const finalContext = {
        ...context,
        question,
        userMessage: input.options.message,
        ...(resolvedQuestion ? { resolvedQuestion } : {}),
        analysis,
      };
      return {
        context: finalContext,
        artifacts: { erpSqlResult: finalContext },
        assistantMessage: {
          content: messageContent(result.success, context.rowCount, result.error, analysis),
          contentJsonb: finalContext,
          displayJsonb: resultDisplay(finalContext),
        },
        contextSummary: finalContext,
      };
    } catch (error) {
      await input.onToolFinish({ step, error, durationMs: Date.now() - startedAt });
      throw error;
    }
  },
};

function toRuntimeContext(result: Awaited<ReturnType<typeof erpSqlAgentService.ask>>) {
  const semanticStatus = result.generation.semanticResult?.status;
  return {
    success: result.success,
    traceId: result.traceId,
    sql: result.sql,
    fields: result.execution?.fields ?? [],
    columns: buildResultColumns(result.execution?.fields ?? [], result.execution?.rows ?? [], result.sql),
    rows: result.execution?.rows ?? [],
    rowCount: result.execution?.rowCount ?? 0,
    truncated: result.execution?.truncated ?? false,
    warnings: result.warnings,
    error: result.error,
    ...(semanticStatus ? { semanticStatus } : {}),
    ...(semanticStatus === "estimate" ? { disclaimer: "此数据不准确，仅供参考" } : {}),
    ...(result.execution?.auditReasons?.length ? { accessAudit: result.execution.auditReasons } : {}),
    ...(result.customerClarification ? { customerClarification: result.customerClarification } : {}),
  };
}

function resultDisplay(context: { fields: string[]; columns: unknown[]; rows: unknown[][]; rowCount: number; truncated: boolean }) {
  return {
    fields: context.fields,
    columns: context.columns,
    rows: context.rows,
    rowCount: context.rowCount,
    truncated: context.truncated,
  };
}

function outOfScopeResponse(question: string, userMessage: string) {
  const context = {
    success: false,
    traceId: "out-of-scope",
    sql: "",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error: ERP_SQL_AGENT_SCOPE_ERROR,
    question,
    userMessage,
    analysis: null,
  };
  return {
    context,
    artifacts: { erpSqlResult: context },
    assistantMessage: {
      content: ERP_SQL_AGENT_SCOPE_ERROR,
      contentJsonb: context,
    },
    contextSummary: context,
  };
}

function readCustomerClarification(context: Record<string, unknown> | undefined): ErpSqlCustomerClarification | undefined {
  const value = context?.customerClarification;
  if (!value || typeof value !== "object") return undefined;
  const clarification = value as Partial<ErpSqlCustomerClarification>;
  if (clarification.status !== "pending") return undefined;
  if (!clarification.keyword || !clarification.originalQuestion || !Array.isArray(clarification.candidates)) return undefined;
  return clarification as ErpSqlCustomerClarification;
}

function selectCustomerCandidate(message: string, candidates: ErpSqlCustomerCandidate[]): ErpSqlCustomerCandidate | undefined {
  const text = message.trim();
  const selectedIndex = readSelectionIndex(text);
  if (selectedIndex !== undefined) return candidates[selectedIndex - 1];
  return candidates.find((candidate) => {
    const values = [candidate.customerName, candidate.shortName, candidate.customerCode].filter(Boolean);
    return values.some((value) => text === value || text.includes(String(value)));
  });
}

function readSelectionIndex(text: string): number | undefined {
  const numeric = text.match(/^(?:选|选择|第)?\s*(\d{1,2})\s*(?:个|项|条)?$/u);
  if (numeric) return Number(numeric[1]);
  const chinese = text.match(/^(?:选|选择|第)?\s*([一二三四五六七八九十])\s*(?:个|项|条)?$/u);
  return chinese ? chineseNumber(chinese[1]) : undefined;
}

function chineseNumber(value: string): number | undefined {
  return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"].indexOf(value) + 1 || undefined;
}

function replaceFirst(text: string, keyword: string, replacement: string): string {
  return text.includes(keyword) ? text.replace(keyword, replacement) : `${text}，客户：${replacement}`;
}

function customerClarificationResponse(message: string, clarification: ErpSqlCustomerClarification) {
  const error = formatCustomerClarificationPrompt(clarification);
  const context = {
    success: false,
    traceId: undefined,
    sql: "",
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [],
    error,
    customerClarification: clarification,
    question: message,
    userMessage: message,
    analysis: null,
  };
  return {
    context,
    artifacts: { erpSqlResult: context },
    assistantMessage: {
      content: messageContent(false, 0, error, null),
      contentJsonb: context,
    },
    contextSummary: context,
  };
}

function formatCustomerClarificationPrompt(clarification: ErpSqlCustomerClarification): string {
  const options = clarification.candidates
    .map((candidate, index) => {
      const suffix = [candidate.shortName && `简称:${candidate.shortName}`, candidate.customerCode && `编码:${candidate.customerCode}`].filter(Boolean).join("，");
      return `${index + 1}. ${candidate.customerName}${suffix ? `（${suffix}）` : ""}`;
    })
    .join("；");
  return `客户“${clarification.keyword}”仍需确认，请回复序号或客户名称：${options}`;
}

async function narrateResult(
  question: string,
  result: Awaited<ReturnType<typeof erpSqlAgentService.ask>>,
  context: ReturnType<typeof toRuntimeContext>,
  signal?: AbortSignal,
): Promise<ResultNarration | null> {
  if (!result.success || context.rowCount === 0) return null;
  try {
    return await resultNarratorService.narrate({
      question,
      sql: context.sql,
      fields: context.fields,
      rows: context.rows.slice(0, 50),
      rowCount: context.rowCount,
      truncated: context.truncated,
      warnings: context.warnings,
      source: result.generation.source,
      signal,
    });
  } catch {
    return null;
  }
}

function messageContent(success: boolean, rowCount: number, error: string | undefined, analysis: ResultNarration | null): string {
  if (error?.startsWith("semantic_mismatch")) {
    return "当前候选 SQL 与问题所需业务口径不一致，结果可能不准，因此没有返回或执行。可以补充要查的业务口径后再试。";
  }
  if (error?.startsWith("blocked_missing_metric")) {
    return "当前精确指标口径还不完整，拼接结果置信度不足。此数据不准确，仅供参考；如需精确结果，需要补齐或审批对应指标口径。";
  }
  if (/timeout|deadline|slow|overloaded|queue is full|429/iu.test(error ?? "")) {
    return "当前 ERP SQL 服务繁忙或阶段超时，系统已停止继续排队或执行。请稍后重试，或缩小查询范围。";
  }
  if (/guard|schema|Referenced field|parse failed|invalid SQL|validation/iu.test(error ?? "")) {
    return "当前候选 SQL 没有通过结构或字段校验，直接执行可能不准，因此没有返回或执行。可以补充表字段口径后再试。";
  }
  if (!success) return `当前问题没有通过精确 SQL 校验，直接执行可能不准。可以补充口径后再试。原因：${error ?? "未知"}`;
  if (analysis) {
    const highlights = analysis.highlights.map((item) => `- ${item}`).join("\n");
    const caveats = analysis.caveats.map((item) => `- ${item}`).join("\n");
    return [analysis.summary, highlights, caveats].filter(Boolean).join("\n");
  }
  if (rowCount === 0) return "SQL 已执行，未查询到数据。";
  return `已生成并执行 SQL，返回 ${rowCount} 行。`;
}
