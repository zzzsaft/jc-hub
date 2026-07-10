export const ERP_SQL_QUERY_PERMISSION = "agent.erp-sql:query";

export const ERP_SQL_SENSITIVE_PERMISSIONS = {
  finance: "agent.erp-sql.sensitive.finance:view",
  customer: "agent.erp-sql.sensitive.customer:view",
  employee: "agent.erp-sql.sensitive.employee:view",
} as const;

export type ErpSqlSensitiveClass = keyof typeof ERP_SQL_SENSITIVE_PERMISSIONS;
export type ErpSqlSensitiveLevel = "masked" | "full";

export type ErpSqlAccessScope = {
  source: "server";
  actorUserId: string;
  companies: string[];
  modules: string[];
  departments: string[] | "*";
  businessUnits: string[] | "*";
  customerNumbers: number[] | "*";
  sensitive: Record<ErpSqlSensitiveClass, ErpSqlSensitiveLevel>;
  auditReasons: ErpSqlAccessAuditReason[];
};

export type ErpSqlAccessAuditReason = {
  code: string;
  category: "authorization" | "scope" | "masking";
  message: string;
  fields?: string[];
};

export type ErpSqlAccessPolicyConfig = {
  users?: Record<string, {
    companies?: unknown;
    modules?: unknown;
    departments?: unknown;
    businessUnits?: unknown;
    customerNumbers?: unknown;
  }>;
};

export function isErpSqlAccessScope(value: unknown): value is ErpSqlAccessScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<ErpSqlAccessScope>;
  return scope.source === "server"
    && typeof scope.actorUserId === "string"
    && Array.isArray(scope.companies)
    && scope.companies.length > 0
    && Array.isArray(scope.modules)
    && scope.modules.length > 0
    && Boolean(scope.sensitive);
}

export function requireErpSqlAccessScope(value: unknown, ownerUserId?: string | null): ErpSqlAccessScope {
  if (!isErpSqlAccessScope(value) || (ownerUserId && value.actorUserId !== ownerUserId)) {
    throw new Error("ERP_SQL_ACCESS_DENIED: missing or mismatched server authorization scope");
  }
  return value;
}
