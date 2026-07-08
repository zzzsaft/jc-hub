import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  AuthService,
  type PermissionItem,
  type RolePermissionItem,
  type UserDirectoryItem,
  type UserPermissionOverride,
} from "@/api/services/auth.service";
import { Button, Checkbox, Empty, Input, message, Pagination, Select, Tabs, Tag } from "@/components/ui/core";
import { useAuthStore } from "@/store/useAuthStore";

const userPageSize = 30;
const overrideEffects = [
  { value: "", label: "默认" },
  { value: "allow", label: "允许" },
  { value: "deny", label: "禁止" },
];

const valueText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const dateText = (value: string | null) => value ? new Date(value).toLocaleString() : "-";

export default function PermissionManagementPage() {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [roles, setRoles] = useState<RolePermissionItem[]>([]);
  const [users, setUsers] = useState<UserDirectoryItem[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedRolePermissions, setSelectedRolePermissions] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [overrides, setOverrides] = useState<Record<string, UserPermissionOverride["effect"] | "">>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const canAny = useAuthStore((state) => state.canAny);
  const canManagePermissions = canAny(["admin.permissions:view"]);
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const roleOptions = roles.map((role) => ({ value: role.id, label: `${role.name} (${role.code})` }));
  const groupedPermissions = useMemo(() => permissions.reduce<Record<string, PermissionItem[]>>((groups, permission) => {
    groups[permission.resource] = groups[permission.resource] || [];
    groups[permission.resource].push(permission);
    return groups;
  }, {}), [permissions]);

  const loadData = async (page = userPage) => {
    setLoading(true);
    setLoadError("");
    try {
      const [permissionResult, roleResult, userResult] = await Promise.all([
        canManagePermissions ? AuthService.listPermissions() : Promise.resolve({ items: [] }),
        canManagePermissions ? AuthService.listRoles() : Promise.resolve({ items: [] }),
        AuthService.listUsers({ keyword, page, pageSize: userPageSize }),
      ]);
      setPermissions(permissionResult.items);
      setRoles(roleResult.items);
      setUsers(userResult.items);
      setUserTotal(userResult.total);
      setUserPage(userResult.page);
      const nextUser = userResult.items.find((user) => user.id === selectedUserId) || userResult.items[0];
      setSelectedUserId(nextUser?.id || "");
      const nextRole = roleResult.items.find((role) => role.id === selectedRoleId) || roleResult.items[0];
      if (nextRole) {
        setSelectedRoleId(nextRole.id);
        setSelectedRolePermissions(nextRole.permissions);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "员工资料加载失败";
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedUserId || !canManagePermissions) {
      setOverrides({});
      return;
    }
    AuthService.getPermissionOverrides(selectedUserId)
      .then((result) => setOverrides(Object.fromEntries(result.items.map((item) => [item.permissionCode, item.effect]))))
      .catch((error) => message.error(error instanceof Error ? error.message : "权限例外加载失败"));
  }, [canManagePermissions, selectedUserId]);

  const saveRolePermissions = async () => {
    if (!selectedRoleId) return;
    setLoading(true);
    try {
      const result = await AuthService.updateRolePermissions(selectedRoleId, selectedRolePermissions);
      setRoles(result.items);
      message.success("角色权限已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "角色权限保存失败");
    } finally {
      setLoading(false);
    }
  };

  const saveOverrides = async () => {
    if (!selectedUserId) return;
    const nextOverrides = Object.entries(overrides)
      .filter((item): item is [string, UserPermissionOverride["effect"]] => item[1] === "allow" || item[1] === "deny")
      .map(([permissionCode, effect]) => ({ permissionCode, effect }));
    setLoading(true);
    try {
      const result = await AuthService.updatePermissionOverrides(selectedUserId, nextOverrides);
      setOverrides(Object.fromEntries(result.items.map((item) => [item.permissionCode, item.effect])));
      message.success("员工权限例外已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "员工权限例外保存失败");
    } finally {
      setLoading(false);
    }
  };

  const selectRole = (roleId: string) => {
    const role = roles.find((item) => item.id === roleId);
    setSelectedRoleId(roleId);
    setSelectedRolePermissions(role?.permissions || []);
  };

  const profileRows = selectedUser
    ? [
        ["姓名", selectedUser.name],
        ["账号", selectedUser.username],
        ["员工号", selectedUser.employeeNo],
        ["企微 UserID", selectedUser.wecomUserId],
        ["ERP UserID", selectedUser.erpUserId],
        ["手机", selectedUser.mobile],
        ["邮箱", selectedUser.email],
        ["岗位", selectedUser.position],
        ["团队", selectedUser.teamName],
        ["主部门", selectedUser.mainDepartment],
        ["状态", selectedUser.status],
        ["最近登录", dateText(selectedUser.lastLoginAt)],
        ["更新时间", dateText(selectedUser.updatedAt)],
      ]
    : [];

  return (
    <div className="grid min-h-[calc(100vh-120px)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex gap-2">
          <Input className="min-w-0 flex-1" value={keyword} placeholder="姓名/账号/工号" onChange={(event: any) => setKeyword(event.target.value)} />
          <Button className="shrink-0 whitespace-nowrap" loading={loading} onClick={() => loadData(1)}>搜索</Button>
        </div>
        <div className="max-h-[calc(100vh-260px)] space-y-1 overflow-auto">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelectedUserId(user.id)}
              className={[
                "w-full rounded-md border px-3 py-2 text-left transition",
                selectedUserId === user.id ? "border-brand-200 bg-brand-50" : "border-transparent hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{user.name}</span>
                <Tag color={user.status === "active" ? "green" : "default"}>{user.status}</Tag>
              </div>
              <div className="mt-1 truncate text-xs text-slate-500">{valueText(user.username || user.employeeNo || user.wecomUserId)}</div>
            </button>
          ))}
          {loadError ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-4 text-sm text-red-700">
              员工资料加载失败：{loadError}
            </div>
          ) : users.length === 0 ? (
            <Empty description="暂无员工" />
          ) : null}
        </div>
        {userTotal > userPageSize ? (
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-center text-xs text-slate-500">共 {userTotal} 人</div>
            <Pagination current={userPage} pageSize={userPageSize} total={userTotal} onChange={(page: number) => loadData(page)} className="justify-center" />
          </div>
        ) : null}
      </aside>

      <section className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{selectedUser?.name || "员工资料"}</h2>
            <p className="text-sm text-slate-500">查看员工身份、账号、角色和权限例外。</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedUser?.roles.map((role) => <Tag key={role}>{role}</Tag>)}
          </div>
        </div>

        <Tabs
          items={[
            {
              key: "profile",
              label: "基本资料",
              children: (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {profileRows.map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-1 break-words text-sm font-medium text-slate-900">{valueText(value)}</div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: "account",
              label: "账号角色",
              children: (
                <div className="space-y-3 text-sm text-slate-700">
                  <div>账号：{valueText(selectedUser?.username)}</div>
                  <div>状态：{valueText(selectedUser?.status)}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>角色：</span>
                    {selectedUser?.roles.length ? selectedUser.roles.map((role) => <Tag key={role}>{role}</Tag>) : <Tag>无</Tag>}
                  </div>
                </div>
              ),
            },
            canManagePermissions && {
              key: "permissions",
              label: "权限",
              children: (
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">员工权限例外</h3>
                        <p className="text-sm text-slate-500">deny 优先于角色 allow。</p>
                      </div>
                      <Button className="shrink-0 whitespace-nowrap" type="primary" loading={loading} disabled={!selectedUserId} onClick={saveOverrides}>保存例外</Button>
                    </div>
                    <PermissionOverrideTable permissions={permissions} overrides={overrides} disabled={!selectedUserId} onChange={setOverrides} />
                  </section>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">角色权限</h3>
                        <p className="text-sm text-slate-500">admin 始终拥有全部启用权限。</p>
                      </div>
                      <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto">
                        <Select className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={selectedRoleId} options={roleOptions} onChange={selectRole} />
                        <Button className="shrink-0 whitespace-nowrap" loading={loading} disabled={!selectedRoleId} onClick={saveRolePermissions}>保存角色</Button>
                      </div>
                    </div>
                    <div className="space-y-4 rounded-md border border-slate-200 p-4">
                      {Object.entries(groupedPermissions).map(([resource, items]) => (
                        <div key={resource} className="space-y-2 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-800">{resource}</span>
                            <Tag>{items.length}</Tag>
                          </div>
                          <Checkbox.Group
                            value={selectedRolePermissions}
                            options={items.map((item) => ({ value: item.code, label: `${item.name} (${item.action})` }))}
                            onChange={setSelectedRolePermissions}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ),
            },
          ].filter(Boolean)}
        />
      </section>
    </div>
  );
}

function PermissionOverrideTable({
  permissions,
  overrides,
  disabled,
  onChange,
}: {
  permissions: PermissionItem[];
  overrides: Record<string, UserPermissionOverride["effect"] | "">;
  disabled: boolean;
  onChange: Dispatch<SetStateAction<Record<string, UserPermissionOverride["effect"] | "">>>;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">权限</th>
            <th className="px-3 py-2">资源</th>
            <th className="px-3 py-2">例外</th>
          </tr>
        </thead>
        <tbody>
          {permissions.map((permission) => (
            <tr key={permission.code} className="border-t border-slate-100">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{permission.name}</div>
                <div className="font-mono text-xs text-slate-400">{permission.code}</div>
              </td>
              <td className="px-3 py-2 text-slate-600">{permission.resource}</td>
              <td className="px-3 py-2">
                <Select
                  className="w-28"
                  value={overrides[permission.code] || ""}
                  options={overrideEffects}
                  disabled={disabled}
                  onChange={(value: string) => onChange((current) => ({ ...current, [permission.code]: value as UserPermissionOverride["effect"] | "" }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
