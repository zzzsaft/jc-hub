export const ERP_SQL_AGENT_SCOPE_ERROR =
  "我只能处理 ERP Agent 相关的 ERP 数据查询、SQL、报表和业务指标问题。";

const ERP_SQL_AGENT_KEYWORDS = [
  "erp",
  "sql",
  "t-sql",
  "报表",
  "finereport",
  "数据表",
  "采购",
  "库存",
  "工单",
  "生产订单",
  "销售订单",
  "销售",
  "采购订单",
  "客户订单",
  "客户",
  "订单",
  "供应商",
  "欠交",
  "物料",
  "料号",
  "出货",
  "发货",
  "收货",
  "入库",
  "出库",
  "应收",
  "应付",
  "收入",
  "成本",
  "毛利",
  "回款",
  "付款",
  "发票",
  "财务",
  "合同",
  "报价",
  "配置",
  "费用",
  "余额",
  "事业部",
  "purchase",
  "inventory",
  "job",
  "sales order",
  "vendor",
  "customer order",
];

const OBVIOUS_NON_ERP_PATTERNS = [
  /天气|气温|下雨|空气质量/u,
  /写.*诗|讲.*笑话|故事|作文|文案/u,
  /翻译|总结这段|润色/u,
  /代码怎么写|前端|css|react|vue|python|java/u,
];

export function isErpSqlAgentQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return ERP_SQL_AGENT_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))
    && !OBVIOUS_NON_ERP_PATTERNS.some((pattern) => pattern.test(normalized));
}
