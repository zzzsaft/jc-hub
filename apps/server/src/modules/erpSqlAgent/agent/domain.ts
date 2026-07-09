export const ERP_SQL_AGENT_SCOPE_ERROR = "我只能处理 ERP Agent 相关的 ERP 数据查询、SQL、报表和业务指标问题。";

const OBVIOUS_NON_ERP_PATTERNS = [
  /天气|气温|下雨|空气质量/u,
  /写.*诗|讲.*笑话|故事|作文|文案/u,
  /翻译|总结这段|润色/u,
  /代码怎么写|前端|css|react|vue|python|java/u,
];

export function isErpSqlAgentQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return !OBVIOUS_NON_ERP_PATTERNS.some((pattern) => pattern.test(normalized));
}
