import type { AgentRuntimeRouteDecision } from "./types.js";
import { isErpSqlAgentQuestion } from "../../modules/erpSqlAgent/agent/domain.js";

export function routeAgentRuntimeMessage(message: string): AgentRuntimeRouteDecision {
  const normalized = message.trim().toLowerCase();
  const erpQuestion = isErpSqlAgentQuestion(normalized);

  if (
    matches(normalized, [
      "配置表",
      "产品配置",
      "产品型号",
      "过滤器",
      "计量泵",
      "字段",
      "参数",
      "历史配置",
      "product config",
      "product configuration",
      "configure product",
      "filter",
      "metering pump",
    ])
  ) {
    return {
      agentType: "productConfigAgent",
      confidence: 0.86,
      reason: "message mentions product configuration concepts",
      needsClarification: false,
    };
  }

  if (erpQuestion && isQueryIntent(normalized) && !isQuoteActionIntent(normalized)) {
    return {
      agentType: "mastraErpSqlAgent",
      confidence: 0.84,
      reason: "message queries an ERP capability",
      needsClarification: false,
    };
  }

  if (matches(normalized, ["报价", "价格", "折扣", "利润", "报价单", "quote", "price", "discount"])) {
    return {
      agentType: "quoteAgent",
      confidence: 0.82,
      reason: "message mentions quote or pricing concepts",
      needsClarification: false,
    };
  }

  if (erpQuestion) {
    return {
      agentType: "mastraErpSqlAgent",
      confidence: 0.84,
      reason: "message asks for ERP SQL data retrieval or reporting",
      needsClarification: false,
    };
  }

  return {
    agentType: "generalAgent",
    confidence: 0.3,
    reason: "no high-confidence agent route matched",
    needsClarification: true,
    clarificationMessage: "你是想生成产品配置表，还是基于配置表创建报价/销售任务？",
  };
}

function matches(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
}

function isQueryIntent(message: string): boolean {
  return matches(message, ["查", "查询", "统计", "分析", "评估", "报表", "明细", "数据", "列表", "记录", "资料", "哪些", "多少", "情况", "对应", "属于", "进度"]);
}

function isQuoteActionIntent(message: string): boolean {
  return matches(message, ["生成", "创建", "新建", "提交", "编辑", "修改", "保存", "删除"]);
}
