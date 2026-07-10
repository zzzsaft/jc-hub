import type { ErpSqlAccessPolicyInput } from "./types.js";

export function toPolicyDto(policy: any) {
  return {
    id: String(policy.id),
    userId: policy.userId,
    roleId: policy.roleId,
    environment: policy.environment,
    rolloutMode: policy.rolloutMode,
    companies: policy.companiesJson,
    modules: policy.modulesJson,
    departments: policy.departmentsJson,
    businessUnits: policy.businessUnitsJson,
    customerNumbers: policy.customerNumbersJson,
    sensitive: {
      finance: policy.sensitiveFinance,
      customer: policy.sensitiveCustomer,
      employee: policy.sensitiveEmployee,
    },
    enabled: policy.enabled,
    reason: policy.reason,
    createdBy: policy.createdBy,
    updatedBy: policy.updatedBy,
    approvedBy: policy.approvedBy,
    effectiveFrom: policy.effectiveFrom,
    expiresAt: policy.expiresAt,
    archivedAt: policy.archivedAt,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

export function toAuditDto(item: any) {
  return {
    id: String(item.id),
    policyId: item.policyId ? String(item.policyId) : null,
    action: item.action,
    actorUserId: item.actorUserId,
    reason: item.reason,
    before: item.beforeJson,
    after: item.afterJson,
    ip: item.ip,
    userAgent: item.userAgent,
    createdAt: item.createdAt,
  };
}

export function toPolicyInput(policy: any): ErpSqlAccessPolicyInput {
  return {
    userId: policy.userId,
    roleId: policy.roleId,
    environment: policy.environment,
    rolloutMode: policy.rolloutMode,
    companies: policy.companiesJson,
    modules: policy.modulesJson,
    departments: policy.departmentsJson,
    businessUnits: policy.businessUnitsJson,
    customerNumbers: policy.customerNumbersJson,
    sensitiveFinance: policy.sensitiveFinance,
    sensitiveCustomer: policy.sensitiveCustomer,
    sensitiveEmployee: policy.sensitiveEmployee,
    enabled: policy.enabled,
    reason: policy.reason,
    approvedBy: policy.approvedBy,
    effectiveFrom: policy.effectiveFrom,
    expiresAt: policy.expiresAt,
  };
}

export function auditSummary(policy: any) {
  return {
    subject: policy.userId ? { userId: policy.userId } : { roleId: policy.roleId },
    environment: policy.environment,
    rolloutMode: policy.rolloutMode,
    enabled: policy.enabled,
    ranges: {
      companies: countRange(policy.companiesJson),
      modules: countRange(policy.modulesJson),
      departments: countRange(policy.departmentsJson),
      businessUnits: countRange(policy.businessUnitsJson),
      customerNumbers: countRange(policy.customerNumbersJson),
    },
    sensitive: {
      finance: policy.sensitiveFinance,
      customer: policy.sensitiveCustomer,
      employee: policy.sensitiveEmployee,
    },
    effectiveFrom: policy.effectiveFrom,
    expiresAt: policy.expiresAt,
    archivedAt: policy.archivedAt,
  };
}

function countRange(value: unknown) {
  return value === "*" ? { wildcard: true } : { wildcard: false, count: Array.isArray(value) ? value.length : 0 };
}
