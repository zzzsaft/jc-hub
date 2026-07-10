import { createHash } from "node:crypto";

const SENSITIVE_KEY = /(rows?|records?|messages?|prompt|question|sql|stack|password|secret|token|authorization|content|output|result|args?|params?|customer|vendor|employee|email|phone|address|bank|account|identity|idcard)/iu;
const ROW_KEY = /^(rows?|records?|previewRows)$/iu;

export function auditHash(value: unknown): string {
  return createHash("sha256").update(stableString(value)).digest("hex");
}

export function protectAuditValue(value: unknown, key = "root"): unknown {
  if (rawAuditPayloadsEnabled()) return jsonSafe(value);
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") {
    if (SENSITIVE_KEY.test(key)) return protectedText(value);
    return redactText(value).slice(0, 256);
  }
  if (Array.isArray(value)) {
    if (ROW_KEY.test(key)) return { redacted: true, rowCount: value.length, hash: auditHash(value) };
    return value.slice(0, 50).map((item) => protectAuditValue(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      protectAuditValue(child, childKey),
    ]));
  }
  return protectedText(String(value));
}

export function protectError(error: unknown): { name: string; message: string; category: string } {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const protectedMessage = /\b(select|insert|update|delete|merge|exec(?:ute)?)\b/iu.test(message)
    ? `[protected SQL-bearing error sha256:${auditHash(message)}]`
    : redactText(message).slice(0, 500);
  return { name, message: protectedMessage, category: classifyError(error) };
}

export function protectBindingParams(params: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params ?? {}).map(([name, value]) => [name, {
    type: value === null ? "null" : typeof value,
    valueHash: auditHash(value),
    ...(rawAuditPayloadsEnabled() ? { value: jsonSafe(value) } : {}),
  }]));
}

export function protectAgentMessage(agentType: string, role: string, content: string | null | undefined): string | null {
  if (content == null || agentType !== "erpSqlAgent" || process.env.AGENT_RUNTIME_RAW_PAYLOADS_ENABLED === "true") return content ?? null;
  if (role === "user" || /\b(select|insert|update|delete|merge|exec(?:ute)?)\b/iu.test(content)) {
    return `[protected ERP message sha256:${auditHash(content)} length:${content.length}]`;
  }
  return redactText(content).slice(0, 2000);
}

export function protectAgentTitle(agentType: string, title: string | null | undefined): string | null {
  if (title == null || agentType !== "erpSqlAgent" || rawAuditPayloadsEnabled()) return title ?? null;
  return `[protected ERP title sha256:${auditHash(title)} length:${title.length}]`;
}

export function classifyFields(fields: string[]): string[] {
  const categories = new Set<string>();
  for (const field of fields) {
    if (/name|customer|vendor|employee|contact|姓名|客户|供应商|员工/iu.test(field)) categories.add("identity");
    else if (/phone|email|address|mobile|电话|邮箱|地址/iu.test(field)) categories.add("contact");
    else if (/amount|price|cost|salary|bank|account|金额|价格|成本|工资|账户/iu.test(field)) categories.add("financial");
    else if (/id|code|number|no$|编号|编码/iu.test(field)) categories.add("identifier");
    else categories.add("business");
  }
  return [...categories].sort();
}

export function classifyError(error: unknown): string {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/abort|cancel/iu.test(message)) return "cancelled";
  if (/timeout|timed out/iu.test(message)) return "timeout";
  if (/permission|forbidden|unauthorized/iu.test(message)) return "permission";
  if (/guard|invalid sql|validation/iu.test(message)) return "validation";
  return "execution";
}

export function rawAuditPayloadsEnabled(): boolean {
  if (process.env.ERP_AUDIT_RAW_PAYLOADS_ENABLED !== "true") return false;
  if (process.env.NODE_ENV === "production") return process.env.ERP_AUDIT_RAW_PAYLOADS_TRUSTED === "true";
  return true;
}

function protectedText(value: string): Record<string, unknown> {
  return { redacted: true, length: value.length, hash: auditHash(value) };
}

function redactText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[email]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, "[phone]")
    .replace(/(?<![A-Z0-9])\d{15,18}[0-9X](?![A-Z0-9])/giu, "[identity]")
    .replace(/(password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]");
}

function stableString(value: unknown): string {
  try {
    return JSON.stringify(canonical(value));
  } catch {
    return String(value);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}
