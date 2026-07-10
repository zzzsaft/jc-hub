INSERT INTO "identity"."permissions" ("id", "code", "resource", "action", "name", "description")
VALUES
  ('agent.erp-sql:query', 'agent.erp-sql:query', 'agent.erp-sql', 'query', '查询 ERP SQL Agent', '允许发起 ERP SQL Agent 查询；仍须配置服务端数据范围'),
  ('agent.erp-sql.sensitive.finance:view', 'agent.erp-sql.sensitive.finance:view', 'agent.erp-sql.sensitive.finance', 'view', '查看 ERP 财务敏感字段', '允许查看未脱敏财务金额字段'),
  ('agent.erp-sql.sensitive.customer:view', 'agent.erp-sql.sensitive.customer:view', 'agent.erp-sql.sensitive.customer', 'view', '查看 ERP 客户敏感字段', '允许查看未脱敏客户信息字段'),
  ('agent.erp-sql.sensitive.employee:view', 'agent.erp-sql.sensitive.employee:view', 'agent.erp-sql.sensitive.employee', 'view', '查看 ERP 员工与报工敏感字段', '允许查看未脱敏员工和报工字段')
ON CONFLICT ("code") DO UPDATE SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;
