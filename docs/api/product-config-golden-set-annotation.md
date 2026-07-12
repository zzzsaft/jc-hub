# Golden Set 标注 API

## v2 全文盲审

v2 基础路径为 `/productConfigAgent/golden-set-v2`。服务端按当前登录账号的有效权限派位：`product-config-agent.golden-set.annotate-a` 对应 A 席位，`product-config-agent.golden-set.annotate-b` 对应 B 席位；复核、导出和归档预览要求 `product-config-agent.golden-set.adjudicate`。v1 `/productConfigAgent/golden-set` 契约保持不变。

### 路由

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/tasks` | `annotate-a` 或 `annotate-b`（只能有一个） | 返回 400 个冻结任务及当前调用席位自己的草稿/提交。 |
| PUT | `/tasks/:documentId/draft` | `annotate-a` 或 `annotate-b`（只能有一个） | 保存当前席位草稿。 |
| POST | `/tasks/:documentId/submit` | `annotate-a` 或 `annotate-b`（只能有一个） | 提交当前席位答案；同席位同文档不可二次提交。 |
| GET | `/adjudications` | `adjudicate` | 仅返回 A、B 均已提交且答案不同的任务。 |
| POST | `/adjudications/:documentId` | `adjudicate` | 写入显式复核结论。 |
| GET | `/export` | `adjudicate` | 生成四份不可覆盖的已提交答案导出。 |
| POST | `/admission-preview` | `adjudicate` | 对已复核文档执行只读归档门禁预览，不写 archive。 |

服务端只从认证个人账号及 `permissionService` 解析有效权限，请求中的 body/query/headers 不接受 slot 或权限选择；local dev 也使用同一数据库权限读取路径。账号同时拥有 A/B 权限、两者都没有、或同时拥有任一标注权限与 `adjudicate` 时均 fail closed：标注与裁决职责双向互斥。列表只附加调用席位自己的 `draft`、`submission`；不会返回另一席位答案、prediction、内部 gold 或未脱敏内容。裁决接口是唯一可同时读取双方已提交答案的入口。

迁移 `20260713010000_golden_set_review_permissions` 以 additive upsert 创建并启用三个权限码，但不会自动授予角色或账号；上线前须通过现有角色/用户权限管理把 A、B、裁决分别分配给不同个人账号。

### DTO

`GET /tasks` 响应：

```ts
type FullReviewTasksResponse = {
  revision: number;
  items: Array<{
    schema_version: "product-config-golden-full-review-v2";
    document_id: string;
    cohort: "calibration" | "acceptance";
    evidence_hash: string; // 冻结 evidence 的规范 SHA-256
    evidence: Array<{ evidence_id: string; content: string }>;
    draft: FullReviewAnnotation | null;
    submission: FullReviewAnnotation | null;
  }>;
};
```

草稿和提交请求均为 `{ revision: number, annotation: FullReviewAnnotation }`，成功响应为 `{ revision: number }`。revision 必须等于 store 当前全局 revision；过期 revision 被拒绝。复核请求使用相同结构。`FullReviewAnnotation` 为：

```ts
type FullReviewAnnotation = {
  admission: {
    decision: "auto_archive" | "quarantine" | "reject";
    reason_codes: string[];
    notes: string | null;
  };
  package: {
    evidence_sufficiency: "sufficient" | "insufficient_evidence" | "legitimate_ambiguity" | "abstain";
    items: Array<{
      gold_item_id: string;
      matched_prediction_item_id: string | null;
      item_name: string;
      product_family: string | null;
      product_subtype: string | null;
      item_role: "peer_product" | "component" | "accessory" | "spare_part" | "sales_kit" | "manufacturing_intermediate" | "unknown";
      model: string | null;
      peer_group_id: string | null;
      related_to_gold_item_id: string | null;
      evidence_refs: string[];
    }>;
    notes: string | null;
  };
  configuration_fields: Array<{
    field_key: string;
    value: string | null;
    unit: string | null;
    option: string | null;
    item_id: string | null;
    evidence_refs: string[];
  }>;
  erp: Array<{
    gold_item_id: string;
    decision: "unique_match" | "legitimate_ambiguity" | "insufficient_evidence" | "abstain";
    acceptable_identities: Array<{
      company: string;
      part_num: string;
      erp_product_name: string;
      evidence_refs: string[];
    }>;
    notes: string | null;
  }>;
};
```

所有产品项、配置字段和 ERP identity 都必须引用本 packet 的冻结 `evidence_id`。ERP 唯一身份键只允许 `Company + PartNum`；每个可销售项恰好有一条 ERP mapping。`auto_archive` 还要求产品包证据充分、至少一个产品项、配置字段均已解析，以及每个可销售项恰好一个 `unique_match` identity。`quarantine`、`reject` 必须带 reason code。

`GET /adjudications` 返回 `{ revision, items }`，每项包含脱敏 `packet`、`annotator_a`、`annotator_b` 和可空 `adjudication`。双方逐字节相同的答案无需进入差异队列；任何差异必须由管理员显式复核，系统不得自行选择 `auto_archive`。

`POST /admission-preview` 请求为 `{ documentId: string }`，仅使用已存复核结论。响应为 `{ decision: "auto_archive" | "quarantine", reason_codes: string[] }`。人工 `reject` 会得到 `quarantine + document_rejected` 的管道门禁结果；它仍是最终拒绝结论，不会触发 archive 写入。

### 快照、导出与 seal

v2 快照固定为 400 个唯一文档：280 个 `calibration`、120 个 `acceptance`。每次任务/存储加载、merge 或 export 请求读取 baseline 时，都会校验 packet schema，并按 `artifact-seal.json` 中列出的 artifact 校验文件存在性、字节数与 SHA-256；这里不声明 manifest 本身有独立 schema/self-seal，也不把校验时点表述为服务启动阶段。禁止覆盖已封存 v2 seal，也禁止混入外部 document ID、cohort、schema version 或 evidence hash。

一次导出原子生成：

- `annotator-a-package.json`
- `annotator-b-package.json`
- `annotator-a-erp.json`
- `annotator-b-erp.json`
- `exports-manifest.json`（记录四份文件的 SHA-256 与字节数）

已有 `exports-manifest.json` 时拒绝覆盖。merge 必须同时校验四份导出的 slot、样本集合、cohort、schema version、evidence hash 和 v2 seal。只有显式复核后的 acceptance 文档，且 acceptance threshold 状态为 `both_layers_passed`、门禁预览返回 `auto_archive`，才可交给后续 archive pipeline；当前接口本身不写归档。任何歧义、证据不足、未解析 ERP、未验证/失败阈值、calibration 文档、`quarantine` 或 `reject` 都是自动终止归档的最终结果，不得转成静默 archive 写入。

## v1 分层标注（保留）

v1 基础路径为 `/productConfigAgent/golden-set`，仍提供 product package / ERP identity 分层任务、草稿、提交、复核与导出；v2 不修改其 sealed baseline 或答案。
