import type { AgentRuntimeRouteDecision } from "./types.js";

export function routeAgentRuntimeMessage(message: string): AgentRuntimeRouteDecision {
  const normalized = message.trim().toLowerCase();

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

  if (matches(normalized, ["报价", "价格", "折扣", "利润", "报价单", "quote", "price", "discount"])) {
    return {
      agentType: "quoteAgent",
      confidence: 0.82,
      reason: "message mentions quote or pricing concepts",
      needsClarification: false,
    };
  }

  if (
    matches(normalized, [
      "erp",
      "sql",
      "报表",
      "查询",
      "统计",
      "采购",
      "库存",
      "工单",
      "销售订单",
      "采购订单",
      "供应商",
      "客户订单",
      "欠交",
      "物料",
      "purchase",
      "inventory",
      "job",
      "sales order",
      "vendor",
      "customer order",
    ])
  ) {
    return {
      agentType: "erpSqlAgent",
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
