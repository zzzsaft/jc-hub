# Golden Set 标注 API（v1）

所有接口位于 `/productConfigAgent/golden-set`，并自动提供 `/quoteAgent` 兼容路径。读取使用现有登录身份；提交复核和导出沿用 ProductConfigAgent 管理员权限。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/tasks?layer=product_package|erp_identity&page&pageSize` | 固定任务与本席位进度。 |
| GET | `/tasks/:sampleId?layer=` | 获取盲标任务；不返回 prediction、另一席位答案或内部 gold id。 |
| PUT | `/tasks/:sampleId/draft` | `{ layer, revision, annotation }` 自动保存；revision 冲突返回 409。 |
| POST | `/tasks/:sampleId/submit` | 同草稿结构；提交后禁止覆盖。 |
| GET | `/erp-search?q&page&pageSize` | 独立、只读的 ERP 产品检索；分页返回脱敏的 Company、PartNum、产品名、ProdCode、BOM 是否存在。 |
| GET | `/adjudications` | 仅双方均已提交且尚未复核的差异队列。 |
| POST | `/adjudications/:sampleId` | `{ layer, gold }` 提交复核结论。 |
| GET | `/export` | 先验证 sealed baseline，再返回 Stage 3.2 evaluator 可消费的 packet。 |

标注席位由服务端用 `PRODUCT_CONFIG_GOLDEN_SET_ANNOTATOR_A_IDS` 和 `..._B_IDS` 绑定。文件存储只用于单实例试标，目录由 `PRODUCT_CONFIG_GOLDEN_SET_ANNOTATION_DIR` 配置；写入使用临时文件原子替换、全局 revision 与 append-only audit。多人并发、长期留存或跨实例部署时必须升级为带唯一约束和事务审计的数据库表。
