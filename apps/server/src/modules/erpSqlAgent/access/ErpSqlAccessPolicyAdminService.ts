import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { auditSummary, toAuditDto, toPolicyDto, toPolicyInput } from "./ErpSqlAccessPolicyAdminMapper.js";
import type { ErpSqlAccessPolicyInput, ErpSqlPolicyCustomerRange, ErpSqlPolicyRange } from "./types.js";

const MODULES = new Set(["sales", "purchase", "production", "inventory", "finance", "custom"]);
const ENVIRONMENTS = new Set(["development", "production"]);

export type AccessPolicyAuditContext = {
  actorUserId?: string | null;
  reason?: unknown;
  ip?: string;
  userAgent?: string;
};

export class ErpSqlAccessPolicyAdminService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: Record<string, unknown>) {
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = { archivedAt: null };
    const keyword = text(query.keyword);
    if (keyword) {
      where.OR = [
        { userId: { contains: keyword, mode: "insensitive" } },
        { roleId: { contains: keyword, mode: "insensitive" } },
        { reason: { contains: keyword, mode: "insensitive" } },
      ];
    }
    if (query.enabled !== undefined) where.enabled = bool(query.enabled);
    if (text(query.userId)) where.userId = text(query.userId);
    const delegate = policyDelegate(this.db);
    const [total, items] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(toPolicyDto), pageInfo: { page, pageSize, total } };
  }

  async get(id: string) {
    const policy = await this.findPolicy(id);
    return toPolicyDto(policy);
  }

  async create(input: ErpSqlAccessPolicyInput, context: AccessPolicyAuditContext) {
    const data = normalizeInput(input);
    const created = await this.db.$transaction(async (tx) => {
      const policy = await policyDelegate(tx).create({
        data: { ...data, createdBy: context.actorUserId ?? null, updatedBy: context.actorUserId ?? null },
      });
      await writeAudit(tx, policy, "create", context, null, auditSummary(policy));
      return policy;
    });
    return toPolicyDto(created);
  }

  async update(id: string, input: ErpSqlAccessPolicyInput, context: AccessPolicyAuditContext) {
    const before = await this.findPolicy(id);
    const data = normalizeInput({ ...toPolicyInput(before), ...stripUndefined(input) });
    const updated = await this.db.$transaction(async (tx) => {
      const policy = await policyDelegate(tx).update({
        where: { id: BigInt(id) },
        data: { ...data, updatedBy: context.actorUserId ?? null },
      });
      await writeAudit(tx, policy, "update", context, auditSummary(before), auditSummary(policy));
      return policy;
    });
    return toPolicyDto(updated);
  }

  async setEnabled(id: string, enabled: boolean, context: AccessPolicyAuditContext) {
    const before = await this.findPolicy(id);
    const updated = await this.db.$transaction(async (tx) => {
      const policy = await policyDelegate(tx).update({
        where: { id: BigInt(id) },
        data: { enabled, updatedBy: context.actorUserId ?? null },
      });
      await writeAudit(tx, policy, enabled ? "enable" : "disable", context, auditSummary(before), auditSummary(policy));
      return policy;
    });
    return toPolicyDto(updated);
  }

  async archive(id: string, context: AccessPolicyAuditContext) {
    const before = await this.findPolicy(id);
    const updated = await this.db.$transaction(async (tx) => {
      const policy = await policyDelegate(tx).update({
        where: { id: BigInt(id) },
        data: { enabled: false, archivedAt: new Date(), updatedBy: context.actorUserId ?? null },
      });
      await writeAudit(tx, policy, "archive", context, auditSummary(before), auditSummary(policy));
      return policy;
    });
    return toPolicyDto(updated);
  }

  previewScope(input: ErpSqlAccessPolicyInput) {
    const data = normalizeInput(input);
    return {
      source: "database_policy_preview",
      subject: data.userId ? { userId: data.userId } : { roleId: data.roleId },
      environment: data.environment,
      rolloutMode: data.rolloutMode,
      companies: data.companiesJson,
      modules: data.modulesJson,
      departments: data.departmentsJson,
      businessUnits: data.businessUnitsJson,
      customerNumbers: data.customerNumbersJson,
      sensitive: {
        finance: data.sensitiveFinance ? "policy_allows_full_if_user_has_permission" : "masked",
        customer: data.sensitiveCustomer ? "policy_allows_full_if_user_has_permission" : "masked",
        employee: data.sensitiveEmployee ? "policy_allows_full_if_user_has_permission" : "masked",
      },
    };
  }

  async auditLogs(id: string, query: Record<string, unknown>) {
    await this.findPolicy(id);
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 100);
    const where = { policyId: BigInt(id) };
    const delegate = auditDelegate(this.db);
    const [total, items] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items: items.map(toAuditDto), pageInfo: { page, pageSize, total } };
  }

  private async findPolicy(id: string) {
    if (!/^\d+$/u.test(id)) throw new AppError(400, "policy id 无效");
    const policy = await policyDelegate(this.db).findUnique({ where: { id: BigInt(id) } });
    if (!policy || policy.archivedAt) throw new AppError(404, "ERP SQL access policy 不存在");
    return policy;
  }
}

function normalizeInput(input: ErpSqlAccessPolicyInput) {
  const userId = text(input.userId);
  const roleId = text(input.roleId);
  if (Boolean(userId) === Boolean(roleId)) throw new AppError(400, "userId 和 roleId 必须且只能提供一个");
  const environment = text(input.environment) || "production";
  if (!ENVIRONMENTS.has(environment)) throw new AppError(400, "environment 无效");
  const companies = stringArray(input.companies, "companies");
  const modules = stringArray(input.modules, "modules");
  if (modules.some((module) => !MODULES.has(module))) throw new AppError(400, "modules 包含无效值");
  return {
    userId: userId || null,
    roleId: roleId || null,
    environment,
    rolloutMode: text(input.rolloutMode) || "production",
    companiesJson: companies,
    modulesJson: modules,
    departmentsJson: range(input.departments, "departments"),
    businessUnitsJson: range(input.businessUnits, "businessUnits"),
    customerNumbersJson: customerRange(input.customerNumbers),
    sensitiveFinance: bool(input.sensitiveFinance),
    sensitiveCustomer: bool(input.sensitiveCustomer),
    sensitiveEmployee: bool(input.sensitiveEmployee),
    enabled: bool(input.enabled),
    reason: text(input.reason) || null,
    approvedBy: text(input.approvedBy) || null,
    effectiveFrom: dateOrNull(input.effectiveFrom),
    expiresAt: dateOrNull(input.expiresAt),
  };
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new AppError(400, `${field} 必须是非空数组`);
  const values = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (!values.length) throw new AppError(400, `${field} 必须是非空数组`);
  return values;
}

function range(value: unknown, field: string): ErpSqlPolicyRange {
  if (value === "*") return "*";
  return stringArray(value, field);
}

function customerRange(value: unknown): ErpSqlPolicyCustomerRange {
  if (value === "*") return "*";
  if (!Array.isArray(value)) throw new AppError(400, "customerNumbers 必须是非空数组或 *");
  const values = [...new Set(value.map(Number).filter((item) => Number.isInteger(item) && item >= 0))];
  if (!values.length) throw new AppError(400, "customerNumbers 必须是非空数组或 *");
  return values;
}

async function writeAudit(tx: any, policy: any, action: string, context: AccessPolicyAuditContext, beforeJson: unknown, afterJson: unknown) {
  await auditDelegate(tx).create({
    data: {
      policyId: policy.id,
      action,
      actorUserId: context.actorUserId ?? null,
      reason: text(context.reason) || text(policy.reason) || null,
      beforeJson,
      afterJson,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  });
}

function policyDelegate(db: any) {
  return db.erpSqlAccessPolicy;
}

function auditDelegate(db: any) {
  return db.erpSqlAccessPolicyAuditLog;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new AppError(400, "日期字段无效");
  return date;
}

function stripUndefined(input: ErpSqlAccessPolicyInput): ErpSqlAccessPolicyInput {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as ErpSqlAccessPolicyInput;
}

export const erpSqlAccessPolicyAdminService = new ErpSqlAccessPolicyAdminService();
