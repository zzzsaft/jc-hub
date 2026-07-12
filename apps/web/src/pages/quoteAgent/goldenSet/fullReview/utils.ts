import type { EvidenceCard, FullReviewAnnotation } from "./types";

const labels: Record<string, string> = {
  document_id: "文档编号",
  product_name: "产品名称",
  evidence_id: "证据编号",
  content: "证据内容",
  company: "公司",
  part_num: "物料编号",
  model: "型号",
  unit: "单位",
};

export function toChineseEvidenceCards(input: unknown): EvidenceCard[] {
  const root = isRecord(input) && isRecord(input.source) ? input.source : input;
  const cards: EvidenceCard[] = [];
  collect(root, cards);
  return cards;
}

function collect(value: unknown, cards: EvidenceCard[], key = "") {
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, cards, key));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([childKey, child]) => {
      if (childKey !== "prediction") collect(child, cards, childKey);
    });
    return;
  }
  if (!key || value === null || value === undefined || value === "") return;
  cards.push({ label: labels[key] ?? key, value: String(value), originalKey: key });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateForSubmit(annotation: FullReviewAnnotation) {
  const errors: string[] = [];
  const add = (condition: boolean, message: string) => { if (condition && !errors.includes(message)) errors.push(message); };
  add(annotation.package.items.some((item) => item.evidence_refs.length === 0), "产品包必须关联证据");
  add(annotation.configuration_fields.some((field) => field.evidence_refs.length === 0), "关键配置必须关联证据");
  add(annotation.erp.some((mapping) => mapping.acceptable_identities.some((identity) => identity.evidence_refs.length === 0)), "ERP 身份必须关联证据");
  add(["quarantine", "reject"].includes(annotation.admission.decision) && annotation.admission.reason_codes.length === 0, "隔离或拒绝必须选择原因");
  if (annotation.admission.decision === "auto_archive") {
    add(annotation.package.evidence_sufficiency !== "sufficient" || annotation.package.items.length === 0, "自动归档需要证据充分的产品包");
    add(annotation.configuration_fields.some((field) => field.value === null && field.option === null), "自动归档不能包含未解决配置");
    add(annotation.erp.some((mapping) => mapping.decision !== "unique_match" || mapping.acceptable_identities.length !== 1), "自动归档要求每个可销售项唯一匹配 ERP 身份");
  }
  return { passed: errors.length === 0, errors };
}
