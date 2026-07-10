import type { PrismaClient } from "@prisma/client";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { permissionService, type PermissionService } from "../../auth/permission.service.js";
import {
  ERP_SQL_QUERY_PERMISSION,
  ERP_SQL_SENSITIVE_PERMISSIONS,
  type ErpSqlAccessPolicyConfig,
  type ErpSqlAccessScope,
} from "./types.js";

export class ErpSqlAccessPolicyService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly permissions: Pick<PermissionService, "hasPermission" | "getEffectivePermissionCodes"> = permissionService,
    private readonly readConfig: () => string | undefined = () => process.env.ERP_SQL_ACCESS_POLICY_JSON,
  ) {}

  async resolve(ownerUserId?: string | null): Promise<ErpSqlAccessScope> {
    if (!ownerUserId) throw denied("登录用户缺失");
    const user = await this.db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, name: true, wecomUserId: true, username: true, userRoles: { select: { role: { select: { id: true, code: true } } } } },
    });
    if (!user) throw denied("登录用户不存在");
    if (isDevFullAccessUser(user)) return devFullAccessScope(user.id);
    const identity = { id: user.id, roles: user.userRoles.map((item) => item.role.code) };
    if (!(await this.permissions.hasPermission(identity, ERP_SQL_QUERY_PERMISSION))) throw denied("缺少 ERP SQL 查询权限");

    const roleIds = user.userRoles.map((item) => item.role.id);
    const dbPolicies = await this.findDbPolicies(user.id, roleIds);
    const dbPolicy = dbPolicies.find((policy) => isPolicyActive(policy));
    if (!dbPolicy && dbPolicies.length) throw denied("用户 ERP 数据范围未启用或不在有效期内");
    const configured = dbPolicy ? policyFromDb(dbPolicy) : fallbackPolicy(user.id, this.readConfig);
    if (!configured) throw denied("用户尚未配置 ERP 数据范围");
    const companies = stringList(configured.companies, false);
    const modules = stringList(configured.modules, false);
    const departments = stringList(configured.departments, true);
    const businessUnits = stringList(configured.businessUnits, true);
    const customerNumbers = numberList(configured.customerNumbers, true);
    if (!companies.length || !modules.length || !departments || !businessUnits || !customerNumbers) {
      throw denied("ERP 数据范围配置不完整");
    }

    const effective = new Set(await this.permissions.getEffectivePermissionCodes(identity));
    const dbSensitive = dbPolicy
      ? {
          finance: dbPolicy.sensitiveFinance,
          customer: dbPolicy.sensitiveCustomer,
          employee: dbPolicy.sensitiveEmployee,
        }
      : { finance: true, customer: true, employee: true };
    return {
      source: "server",
      actorUserId: user.id,
      companies,
      modules,
      departments,
      businessUnits,
      customerNumbers,
      sensitive: {
        finance: dbSensitive.finance && effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.finance) ? "full" : "masked",
        customer: dbSensitive.customer && effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.customer) ? "full" : "masked",
        employee: dbSensitive.employee && effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.employee) ? "full" : "masked",
      },
      auditReasons: [{
        code: dbPolicy ? "erp_sql_scope_resolved_db_policy" : "erp_sql_scope_resolved_env_fallback",
        category: "authorization",
        message: dbPolicy
          ? `服务端已从数据库 policy ${String(dbPolicy.id)} 为用户 ${user.id} 生成 ERP SQL 数据范围。`
          : `服务端已通过 ERP_SQL_ACCESS_POLICY_JSON fallback 为用户 ${user.id} 生成 ERP SQL 数据范围。`,
      }],
    };
  }

  private async findDbPolicies(userId: string, roleIds: string[]): Promise<DbPolicyRow[]> {
    const delegate = (this.db as any).erpSqlAccessPolicy;
    if (!delegate?.findMany) return [];
    const environment = currentPolicyEnvironment();
    return delegate.findMany({
      where: {
        archivedAt: null,
        environment,
        OR: [
          { userId },
          ...(roleIds.length ? [{ roleId: { in: roleIds } }] : []),
        ],
      },
      orderBy: [{ userId: "desc" }, { updatedAt: "desc" }],
    });
  }
}

export function parsePolicyConfig(raw: string | undefined): ErpSqlAccessPolicyConfig {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ErpSqlAccessPolicyConfig : {};
  } catch {
    throw denied("ERP_SQL_ACCESS_POLICY_JSON 不是有效 JSON");
  }
}

function stringList(value: unknown, allowAll: false): string[];
function stringList(value: unknown, allowAll: true): string[] | "*" | undefined;
function stringList(value: unknown, allowAll: boolean): string[] | "*" | undefined {
  if (allowAll && value === "*") return "*";
  if (!Array.isArray(value)) return undefined;
  const values = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  return values.length ? values : undefined;
}

function numberList(value: unknown, allowAll: true): number[] | "*" | undefined {
  if (allowAll && value === "*") return "*";
  if (!Array.isArray(value)) return undefined;
  const values = [...new Set(value.map(Number).filter((item) => Number.isInteger(item) && item >= 0))];
  return values.length ? values : undefined;
}

type DbPolicyRow = {
  id: bigint | number | string;
  enabled: boolean;
  effectiveFrom?: Date | null;
  expiresAt?: Date | null;
  companiesJson: unknown;
  modulesJson: unknown;
  departmentsJson: unknown;
  businessUnitsJson: unknown;
  customerNumbersJson: unknown;
  sensitiveFinance: boolean;
  sensitiveCustomer: boolean;
  sensitiveEmployee: boolean;
};

function currentPolicyEnvironment(): string {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function isPolicyActive(policy: DbPolicyRow): boolean {
  const now = Date.now();
  return policy.enabled
    && (!policy.effectiveFrom || policy.effectiveFrom.getTime() <= now)
    && (!policy.expiresAt || policy.expiresAt.getTime() > now);
}

function policyFromDb(policy: DbPolicyRow): NonNullable<ErpSqlAccessPolicyConfig["users"]>[string] {
  return {
    companies: policy.companiesJson,
    modules: policy.modulesJson,
    departments: policy.departmentsJson,
    businessUnits: policy.businessUnitsJson,
    customerNumbers: policy.customerNumbersJson,
    sensitiveFinance: policy.sensitiveFinance,
    sensitiveCustomer: policy.sensitiveCustomer,
    sensitiveEmployee: policy.sensitiveEmployee,
  };
}

function fallbackPolicy(userId: string, readConfig: () => string | undefined): NonNullable<ErpSqlAccessPolicyConfig["users"]>[string] | undefined {
  const fallbackMode = process.env.ERP_SQL_ACCESS_POLICY_FALLBACK_MODE;
  const allowed = process.env.NODE_ENV !== "production" || fallbackMode === "emergency";
  if (!allowed) return undefined;
  const configured = parsePolicyConfig(readConfig()).users?.[userId];
  if (configured) {
    logger.warn(`[erpSqlAccessPolicy] using env fallback policy for user=${userId} mode=${fallbackMode ?? "development"}`);
  }
  return configured;
}

function denied(reason: string): AppError {
  return new AppError(403, `ERP_SQL_ACCESS_DENIED: ${reason}`);
}

function isDevFullAccessUser(user: { name?: string | null; username?: string | null; wecomUserId?: string | null }): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return [user.wecomUserId, user.username, user.name].some((value) => /^(LiangZhi|梁之)$/iu.test(String(value ?? "").trim()));
}

function devFullAccessScope(actorUserId: string): ErpSqlAccessScope {
  return {
    source: "server",
    actorUserId,
    devFullAccess: true,
    companies: ["DEV_ALL"],
    modules: ["sales", "purchase", "production", "inventory", "finance", "custom"],
    departments: "*",
    businessUnits: "*",
    customerNumbers: "*",
    sensitive: { finance: "full", customer: "full", employee: "full" },
    auditReasons: [{
      code: "erp_sql_dev_full_access",
      category: "authorization",
      message: "开发环境已为该用户启用 ERP SQL 全范围调试权限。",
    }],
  };
}

export const erpSqlAccessPolicyService = new ErpSqlAccessPolicyService();
