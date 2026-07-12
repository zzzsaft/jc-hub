INSERT INTO "identity"."permissions" ("id", "code", "resource", "action", "name", "description", "enabled")
VALUES
  ('product-config-agent.golden-set.annotate-a', 'product-config-agent.golden-set.annotate-a', 'product-config-agent.golden-set', 'annotate-a', 'Golden Set A 席位标注', '允许以个人账号执行 Golden Set v2 A 席位盲标', TRUE),
  ('product-config-agent.golden-set.annotate-b', 'product-config-agent.golden-set.annotate-b', 'product-config-agent.golden-set', 'annotate-b', 'Golden Set B 席位标注', '允许以个人账号执行 Golden Set v2 B 席位盲标', TRUE),
  ('product-config-agent.golden-set.adjudicate', 'product-config-agent.golden-set.adjudicate', 'product-config-agent.golden-set', 'adjudicate', 'Golden Set 裁决', '允许查看 Golden Set v2 双方提交并执行裁决、导出与归档预览', TRUE)
ON CONFLICT ("code") DO UPDATE SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "enabled" = TRUE,
  "updated_at" = CURRENT_TIMESTAMP;
