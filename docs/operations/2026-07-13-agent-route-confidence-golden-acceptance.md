# Agent 路由双置信度网页 Golden 验收

## 范围

- 页面：`http://localhost:2035/agent/chat`
- 后端：`http://localhost:2030`
- 分支：`codex/erp-sql-golden-capabilities`
- 验收日期：2026-07-13
- 方式：在真实网页输入框提交 5 个既有 Golden 场景；采购场景在同一会话追加一轮时间范围回答。

报告不记录结果行、SQL、供应商、客户、金额或其他业务实体，只保留路由与终态元数据。

## 结果

| 场景 | 可见终态 | Agent / 双置信度 | 能力 | 路径 | Trace | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 最近有哪些单要交货了 | 结果摘要与表格 | ERP / 0.95, 0.90 | `sales.open_shipping` | composer | `9b608b9f-2fd5-433f-a5f9-096c1be92f1b` | PASS |
| 采购金额按供应商统计 | 定向询问时间范围 | ERP / 1.00, 1.00 | `purchase.supplier_amount_summary` | clarification | `d53c56a4-18e5-4614-a484-56939210ef61` | PASS |
| 同会话回答“最近一个月” | 结果摘要与表格 | ERP / 1.00, 1.00 | `purchase.supplier_amount_summary` | composer | `2eb890fe-58f9-491a-94da-722b10074c93` | PASS |
| 按产品类别，上个月销售额最高，和去年同比 | 当前期、比较期、差额、同比率 | ERP / 1.00, 1.00 | `sales.product_category_yoy` | composer | `f5289358-e227-480d-a76c-e505d7de2338` | PASS |
| 查物料 0901010001 的库存 | 明确空数据说明与列结构 | ERP / 1.00, 1.00 | `inventory.stock_lookup` | validated template | `383ff7f9-709c-472e-8ce0-6be22387046e` | PASS |
| 查有哪些工序 | 工序主数据摘要与表格 | ERP / 0.95, 0.90 | `operation.master_data` | validated template | `214f6db4-fa70-4246-914e-e3633c30d709` | PASS |

## 门槛检查

- 5/5 场景均产生可见 assistant 正文。
- 0 条空白消息，0 条仅详情无正文，0 条无限加载，0 条超时。
- 采购首轮未选择“采购交付跟踪”；缺少时间时只询问时间范围。
- 采购第二轮与首轮使用同一会话和同一能力，继承采购金额指标与供应商维度。
- 三个汇总分析均走 approved metric composer；库存与工序仅使用覆盖校验通过的模板。
- 所有请求仍先经过 LLM 结构化分类，未增加 Golden 问句或关键词路由。

## 环境说明

工序只读能力必须使用注册表实际读取的开关 `ERP_SQL_OPERATION_MASTER_DATA_ENABLED=true`。旧启动命令中的 `ERP_SQL_OPERATION_MASTER_ENABLED` 不生效，会使 LLM 看到该能力为关闭状态并可能选择相邻能力。
