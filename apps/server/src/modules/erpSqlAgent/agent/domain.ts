export const ERP_SQL_AGENT_SCOPE_ERROR = "我只能处理 ERP Agent 相关的 ERP 数据查询、SQL、报表和业务指标问题。";

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
  "purchase",
  "inventory",
  "job",
  "sales order",
  "vendor",
  "customer order",
];

export function isErpSqlAgentQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return ERP_SQL_AGENT_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
