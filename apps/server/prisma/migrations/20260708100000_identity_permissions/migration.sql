CREATE TABLE IF NOT EXISTS "identity"."permissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "permissions_code_key" ON "identity"."permissions"("code");
CREATE INDEX IF NOT EXISTS "permissions_resource_idx" ON "identity"."permissions"("resource");

CREATE TABLE IF NOT EXISTS "identity"."role_permissions" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "identity"."user_permission_overrides" (
  "user_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id", "permission_id"),
  CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_permission_overrides_effect_check" CHECK ("effect" IN ('allow', 'deny'))
);

INSERT INTO "identity"."roles" ("id", "code", "name")
VALUES
  ('worker', 'worker', '员工'),
  ('leader', 'leader', '小组长'),
  ('admin', 'admin', '管理员')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name";

INSERT INTO "identity"."permissions" ("id", "code", "resource", "action", "name", "description")
VALUES
  ('admin:view', 'admin:view', 'admin', 'view', '访问后台', '访问 ERP 管理后台'),
  ('admin.employees:view', 'admin.employees:view', 'admin.employees', 'view', '查看员工资料', '查看员工资料页'),
  ('admin.permissions:view', 'admin.permissions:view', 'admin.permissions', 'view', '查看权限', '查看角色权限和员工权限例外'),
  ('admin.permissions:update', 'admin.permissions:update', 'admin.permissions', 'update', '维护权限', '维护角色权限和员工权限例外'),
  ('admin.purchase.apply:view', 'admin.purchase.apply:view', 'admin.purchase.apply', 'view', '查看采购申请', '查看采购申请页面'),
  ('admin.purchase.apply:create', 'admin.purchase.apply:create', 'admin.purchase.apply', 'create', '新建采购申请', '创建采购申请'),
  ('admin.purchase.apply:update', 'admin.purchase.apply:update', 'admin.purchase.apply', 'update', '编辑采购申请', '编辑采购申请'),
  ('admin.purchase.apply:delete', 'admin.purchase.apply:delete', 'admin.purchase.apply', 'delete', '删除采购申请', '删除采购申请'),
  ('admin.purchase.apply:export', 'admin.purchase.apply:export', 'admin.purchase.apply', 'export', '导出采购申请', '导出采购申请'),
  ('admin.purchase.apply:approve', 'admin.purchase.apply:approve', 'admin.purchase.apply', 'approve', '审批采购申请', '审批采购申请'),
  ('admin.purchase.apply:use', 'admin.purchase.apply:use', 'admin.purchase.apply', 'use', '使用采购申请功能', '使用采购申请功能'),
  ('admin.quote:view', 'admin.quote:view', 'admin.quote', 'view', '查看报价业务', '查看报价后台页面'),
  ('admin.template:view', 'admin.template:view', 'admin.template', 'view', '查看模板管理', '查看模板管理页面'),
  ('admin.external-contact:view', 'admin.external-contact:view', 'admin.external-contact', 'view', '查看外部联系人', '查看外部联系人页面'),
  ('work:view', 'work:view', 'work', 'view', '访问移动工作台', '访问生产员工移动端'),
  ('work.claim:view', 'work.claim:view', 'work.claim', 'view', '查看领取工序', '查看领取工序页面'),
  ('work.operations:view', 'work.operations:view', 'work.operations', 'view', '查看工序清单', '查看工序清单页面'),
  ('work.stats:view', 'work.stats:view', 'work.stats', 'view', '查看我的统计', '查看我的统计页面'),
  ('work.me:view', 'work.me:view', 'work.me', 'view', '查看我的', '查看个人工作台页面'),
  ('agent.chat:view', 'agent.chat:view', 'agent.chat', 'view', '访问 Agent 对话', '暂保留 Agent 页面访问权限')
ON CONFLICT ("code") DO UPDATE SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
