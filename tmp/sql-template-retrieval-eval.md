# SQL Template Retrieval Eval

## Summary

- caseCount: 160
- templateCount: 35
- top1Accuracy: 0.6625
- top3Accuracy: 0.6625
- failedCount: 54

## Failed Cases

- 查供应商某某还有哪些采购单没到货: expected family_062 got family_002
- 采购单 12345 的到货情况: expected family_062 got family_013
- 未来 7 天内要到货的采购明细: expected family_062 got family_002
- 哪些采购订单延期未到货: expected family_062 got family_002
- 供应商某某还有多少没到货: expected family_062 got family_002
- 采购订单 88888 还有哪些行没到货: expected family_062 got family_002
- 本周应到货采购明细: expected family_062 got family_002
- 查采购到货跟踪表: expected family_062 got family_002
- 供应商 ABC 的采购订单哪些还未收货: expected family_062 got family_013
- 采购单 90001 已到多少还剩多少: expected family_062 got family_013
- 查今天应该到货但没到的采购单: expected family_062 got family_002
- 哪些供应商交期已经超了: expected family_062 got family_002
- 查采购未到货明细按供应商汇总: expected family_062 got family_002
- 采购订单 10086 的收货进度: expected family_062 got family_002
- 近 3 天要到货的采购物料: expected family_062 got family_027
- 查供应商某某延期到货的物料: expected family_062 got family_027
- 哪些采购明细还没有完全到货: expected family_062 got family_002
- 采购单 45678 哪些料还没收齐: expected family_062 got family_013
- 按供应商查未到货采购订单: expected family_062 got family_002
- 查采购订单延期清单: expected family_062 got family_002
- 查客户某某的销售订单: expected family_016 got family_002
- 订单 10086 的明细: expected family_016 got family_021
- 订单 10086 的待发货情况: expected family_037 got family_021
- 客户某某有哪些待发货订单: expected family_037 got family_002
- 客户 A 有哪些销售订单明细: expected family_016 got family_100
- 销售订单 10086 有哪些物料: expected family_016 got family_027
- 哪些销售订单还没发货: expected family_037 got family_002
- 客户 A 未发货订单: expected family_037 got family_100
- 订单 10086 发货通知明细: expected family_037 got family_021
- 查销售订单 20001 的产品明细: expected family_016 got family_002
- 客户某某下了哪些订单: expected family_016 got family_002
- 销售订单 30002 是否还有未发货数量: expected family_037 got family_021
- 发货通知里订单 40003 的明细: expected family_037 got family_002
- 按客户查销售订单列表: expected family_016 got family_002
- 查客户某某还欠发哪些货: expected family_037 got family_002
- 销售订单明细按物料查看: expected family_016 got family_027
- 查所有待发货销售订单: expected family_037 got family_002
- 客户 B 的发货通知有哪些: expected family_037 got finance_skeleton_group_ranking
- 销售订单 50005 的客户和物料明细: expected family_016 got family_027
- 哪些订单已经通知发货但还没发完: expected family_037 got family_002
- ABC123 的库存明细到库位: expected family_050 got family_027
- CPC001 仓库库存明细: expected family_050 got family_027
- 查某个物料在哪些库位有库存: expected family_050 got family_027
- 物料 77777 在 CPC001 仓库的库位库存: expected family_050 got family_027
- 查库位上的现有库存: expected family_050 got family_027
- 查工单 J12345 的物料需求: expected family_076 got family_027
- 哪些工单现在缺料: expected family_076 got family_002
- 工单 J12345 缺哪些料: expected family_076 got family_031
- 物料 ABC123 被哪些工单需求: expected family_076 got family_027
- 工单 J12345 未发料明细: expected family_076 got family_031
- 哪些生产工单物料还没发齐: expected family_076 got family_027
- 工单 77777 还要领哪些料: expected family_076 got family_031
- 查缺料明细按工单列出: expected family_076 got family_002
- 哪些工单需求物料 ABC123: expected family_076 got family_027

