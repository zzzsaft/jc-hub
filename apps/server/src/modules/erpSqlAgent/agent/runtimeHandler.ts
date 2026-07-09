import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { erpSqlAgentService } from "./index.js";
import { ERP_SQL_AGENT_SCOPE_ERROR, isErpSqlAgentQuestion } from "./domain.js";
import { resultNarratorService, type ResultNarration } from "./service/ResultNarratorService.js";
import type { ErpSqlCustomerCandidate, ErpSqlCustomerClarification } from "./types/ErpSqlAgentTypes.js";

export const agentRuntimeErpSqlHandler: AgentRuntimeAgentHandler = {
  agentType: "erpSqlAgent",
  async createPlan(options) {
    return {
      intent: "erp_sql_query",
      steps: [{ id: "erp_sql_ask", tool: "erpSqlAgent.ask", args: { question: options.message } }],
      question: options.message,
    };
  },
  async executePlan(input) {
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
      });
      await input.onToolFinish({ step, result, durationMs: Date.now() - startedAt });
      const context = toRuntimeContext(result);
      const analysis = await narrateResult(question, result, context);
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
  return {
    success: result.success,
    traceId: result.traceId,
    sql: result.sql,
    fields: result.execution?.fields ?? [],
    rows: result.execution?.rows ?? [],
    rowCount: result.execution?.rowCount ?? 0,
    truncated: result.execution?.truncated ?? false,
    warnings: result.warnings,
    error: result.error,
    ...(result.customerClarification ? { customerClarification: result.customerClarification } : {}),
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
      content: `SQL 查询失败：${error}`,
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
    });
  } catch {
    return null;
  }
}

function messageContent(success: boolean, rowCount: number, error: string | undefined, analysis: ResultNarration | null): string {
  if (!success) return `SQL 查询失败：${error ?? "未知错误"}`;
  if (analysis) {
    const highlights = analysis.highlights.map((item) => `- ${item}`).join("\n");
    const caveats = analysis.caveats.map((item) => `- ${item}`).join("\n");
    return [analysis.summary, highlights, caveats].filter(Boolean).join("\n");
  }
  if (rowCount === 0) return "SQL 已执行，未查询到数据。";
  return `已生成并执行 SQL，返回 ${rowCount} 行。`;
}
