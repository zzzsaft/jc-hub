import type {
  ProductConfigAgentEntities,
  ProductConfigAgentIntent,
  ProductConfigAgentPlan,
  ProductConfigAgentReferenceMode,
} from "./types.js";

const REFERENCE_KEYWORDS: Array<{ mode: ProductConfigAgentReferenceMode; keywords: string[] }> = [
  { mode: "latest", keywords: ["最新", "最近", "上次", "last", "latest"] },
  { mode: "deal_won", keywords: ["成交", "已成交", "won", "deal"] },
  { mode: "similar", keywords: ["类似", "相似", "参考", "similar"] },
  { mode: "common", keywords: ["常用", "通用", "common"] },
];

export function parseProductConfigAgentIntent(
  userMessage: string,
): Pick<ProductConfigAgentPlan, "intent" | "entities" | "missingRequiredFields"> {
  const message = userMessage.trim();
  const lowerMessage = message.toLowerCase();
  const intent = inferIntent(lowerMessage);
  const entities = inferEntities(message);
  const missingRequiredFields =
    intent === "generate_config" && !entities.productType && !entities.productNumber
      ? ["productType_or_productNumber"]
      : [];
  return { intent, entities, missingRequiredFields };
}

function inferIntent(message: string): ProductConfigAgentIntent {
  if (["?", "？", "什么", "如何", "解释", "说明", "why", "explain"].some((item) => message.includes(item))) {
    return "explain_config";
  }
  if (["查找", "查询", "搜索", "找一下", "历史", "案例", "search"].some((item) => message.includes(item))) {
    return "search_cases";
  }
  if (["修改", "改成", "调整", "更新", "modify", "update"].some((item) => message.includes(item))) {
    return "modify_config";
  }
  if (!message || ["不确定", "再问", "澄清", "clarify"].some((item) => message.includes(item))) {
    return "clarify";
  }
  return "generate_config";
}

function inferEntities(message: string): ProductConfigAgentEntities {
  const entities: ProductConfigAgentEntities = {};
  const productNumber = matchFirst(message, [
    /(?:产品编号|产品号|料号|productNumber|product number|PN)[:：\s]*([A-Za-z0-9_.\-\/]+)/i,
    /\b([A-Z]{1,8}[-_][A-Z0-9][A-Z0-9_.\-\/]{2,})\b/,
  ]);
  if (productNumber) entities.productNumber = productNumber;

  const customerName = matchFirst(message, [
    /(?:客户|客户名称|customer)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()_.\-]{2,40})/,
  ]);
  if (customerName) entities.customerName = trimEntity(customerName);

  const industry = matchFirst(message, [
    /(?:行业|industry)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()_.\-]{2,30})/,
  ]);
  if (industry) entities.industry = trimEntity(industry);

  const productType = matchFirst(message, [
    /(?:产品类型|产品|机型|productType|product type)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()_.\-]{2,40})/i,
  ]);
  if (productType) entities.productType = trimEntity(productType);

  for (const reference of REFERENCE_KEYWORDS) {
    if (reference.keywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()))) {
      entities.referenceMode = reference.mode;
      break;
    }
  }
  entities.referenceMode ??= "similar";
  return entities;
}

function matchFirst(input: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function trimEntity(value: string): string {
  return value.replace(/[，。；;,.!?？].*$/, "").trim();
}
