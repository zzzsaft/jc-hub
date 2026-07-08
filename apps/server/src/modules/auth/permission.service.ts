import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "./types.js";

export type PermissionEffect = "allow" | "deny";

export interface PermissionSummary {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

export const resolveEffectivePermissionCodes = (input: {
  enabledPermissions: string[];
  rolePermissions: string[];
  allowOverrides: string[];
  denyOverrides: string[];
  roles: string[];
}) => {
  if (input.roles.includes("admin")) return [...new Set(input.enabledPermissions)].sort();
  const codes = new Set(input.rolePermissions);
  input.allowOverrides.forEach((code) => codes.add(code));
  input.denyOverrides.forEach((code) => codes.delete(code));
  return [...codes].sort();
};

export class PermissionService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getEffectivePermissionCodes(user: Pick<AuthenticatedUser, "id" | "roles">) {
    const enabledPermissions = await this.db.permission.findMany({
      where: { enabled: true },
      select: { id: true, code: true }
    });
    const rolePermissions = await this.db.rolePermission.findMany({
      where: { role: { code: { in: user.roles } }, permission: { enabled: true } },
      include: { permission: true }
    });
    const overrides = await this.db.userPermissionOverride.findMany({
      where: { userId: user.id, permission: { enabled: true } },
      include: { permission: true }
    });

    return resolveEffectivePermissionCodes({
      roles: user.roles,
      enabledPermissions: enabledPermissions.map((permission) => permission.code),
      rolePermissions: rolePermissions.map((item) => item.permission.code),
      allowOverrides: overrides.filter((item) => item.effect === "allow").map((item) => item.permission.code),
      denyOverrides: overrides.filter((item) => item.effect === "deny").map((item) => item.permission.code)
    });
  }

  async hasPermission(user: Pick<AuthenticatedUser, "id" | "roles">, code: string) {
    if (user.roles.includes("admin")) {
      return Boolean(await this.db.permission.findFirst({ where: { code, enabled: true }, select: { id: true } }));
    }
    return (await this.getEffectivePermissionCodes(user)).includes(code);
  }

  requirePermission(code: string) {
    return async (user: Pick<AuthenticatedUser, "id" | "roles">) => {
      if (!(await this.hasPermission(user, code))) throw new AppError(403, "当前用户无权限");
      return user;
    };
  }

  async listPermissions() {
    const items = await this.db.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] });
    return { items: items.map(serializePermission) };
  }

  async listRoles() {
    const roles = await this.db.role.findMany({
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { code: "asc" }
    });
    return {
      items: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        permissions: role.rolePermissions.map((item) => item.permission.code).sort()
      }))
    };
  }

  async updateRolePermissions(roleId: string, permissionCodes: unknown) {
    if (!Array.isArray(permissionCodes)) throw new AppError(400, "permissions 必须是数组");
    const codes = [...new Set(permissionCodes.map((code) => String(code).trim()).filter(Boolean))];
    const role = await this.db.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) throw new AppError(404, "角色不存在");
    const permissions = await this.db.permission.findMany({ where: { code: { in: codes }, enabled: true } });
    if (permissions.length !== codes.length) throw new AppError(400, "包含无效权限");

    await this.db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
          skipDuplicates: true
        });
      }
    });
    return this.listRoles();
  }

  async getUserPermissionOverrides(userId: string) {
    await this.assertUserExists(userId);
    const items = await this.db.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true }
    });
    return {
      items: items.map((item) => ({
        permissionCode: item.permission.code,
        effect: item.effect as PermissionEffect
      })).sort((a, b) => a.permissionCode.localeCompare(b.permissionCode))
    };
  }

  async updateUserPermissionOverrides(userId: string, input: unknown) {
    await this.assertUserExists(userId);
    if (!Array.isArray(input)) throw new AppError(400, "overrides 必须是数组");
    const overrides = input.map((item: any) => ({
      permissionCode: String(item?.permissionCode ?? "").trim(),
      effect: String(item?.effect ?? "").trim()
    }));
    if (overrides.some((item) => !item.permissionCode || !["allow", "deny"].includes(item.effect))) {
      throw new AppError(400, "权限例外无效");
    }
    const permissions = await this.db.permission.findMany({
      where: { code: { in: overrides.map((item) => item.permissionCode) }, enabled: true }
    });
    if (permissions.length !== overrides.length) throw new AppError(400, "包含无效权限");
    const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));

    await this.db.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      if (overrides.length) {
        await tx.userPermissionOverride.createMany({
          data: overrides.map((item) => ({
            userId,
            permissionId: permissionByCode.get(item.permissionCode)!.id,
            effect: item.effect
          })),
          skipDuplicates: true
        });
      }
    });
    return this.getUserPermissionOverrides(userId);
  }

  private async assertUserExists(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AppError(404, "用户不存在");
  }
}

const serializePermission = (permission: PermissionSummary): PermissionSummary => ({
  id: permission.id,
  code: permission.code,
  resource: permission.resource,
  action: permission.action,
  name: permission.name,
  description: permission.description,
  enabled: permission.enabled
});

export const permissionService = new PermissionService();
