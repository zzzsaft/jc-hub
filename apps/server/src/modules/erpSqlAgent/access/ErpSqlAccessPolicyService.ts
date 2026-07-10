import type { PrismaClient } from "@prisma/client";
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
      select: { id: true, userRoles: { select: { role: { select: { code: true } } } } },
    });
    if (!user) throw denied("登录用户不存在");
    const identity = { id: user.id, roles: user.userRoles.map((item) => item.role.code) };
    if (!(await this.permissions.hasPermission(identity, ERP_SQL_QUERY_PERMISSION))) throw denied("缺少 ERP SQL 查询权限");

    const configured = parsePolicyConfig(this.readConfig()).users?.[user.id];
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
    return {
      source: "server",
      actorUserId: user.id,
      companies,
      modules,
      departments,
      businessUnits,
      customerNumbers,
      sensitive: {
        finance: effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.finance) ? "full" : "masked",
        customer: effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.customer) ? "full" : "masked",
        employee: effective.has(ERP_SQL_SENSITIVE_PERMISSIONS.employee) ? "full" : "masked",
      },
      auditReasons: [{
        code: "erp_sql_scope_resolved",
        category: "authorization",
        message: `服务端已为用户 ${user.id} 生成 ERP SQL 数据范围。`,
      }],
    };
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

function denied(reason: string): AppError {
  return new AppError(403, `ERP_SQL_ACCESS_DENIED: ${reason}`);
}

export const erpSqlAccessPolicyService = new ErpSqlAccessPolicyService();
