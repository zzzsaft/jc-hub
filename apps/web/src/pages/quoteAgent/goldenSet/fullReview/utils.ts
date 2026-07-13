import type { ConfigurationField, EvidenceCard, EvidenceDisplayRow, EvidenceSection, FrozenEvidence, FullReviewAnnotation, PackageAnnotation } from "./types";

const nonSellableRoles = new Set(["component", "manufacturing_intermediate"]);

export function addConfigurationField(fields: ConfigurationField[]): ConfigurationField[] {
  const next = Math.max(0, ...fields.map((field) => Number(field.field_key.match(/^configuration_field_(\d+)$/u)?.[1] ?? 0))) + 1;
  return [...fields, { field_key: `configuration_field_${next}`, value: null, unit: null, option: null, item_id: null, evidence_refs: [] }];
}

export function removeConfigurationField(fields: ConfigurationField[], index: number): ConfigurationField[] {
  return fields.filter((_, fieldIndex) => fieldIndex !== index);
}

export function reconcilePackageAnnotation(annotation: FullReviewAnnotation, pkg: PackageAnnotation): FullReviewAnnotation {
  const sellableIds = new Set(pkg.items.filter((item) => !nonSellableRoles.has(item.item_role)).map((item) => item.gold_item_id));
  return { ...annotation, package: pkg, erp: annotation.erp.filter((mapping) => sellableIds.has(mapping.gold_item_id)) };
}

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

const evidenceFallback = "暂时无法结构化展示，请查看原始证据。";

export function toEvidenceSections(evidence: FrozenEvidence[]): EvidenceSection[] {
  return evidence.map((item) => {
    try {
      if (item.evidence_id.startsWith("block:")) return parseBlockEvidence(item);
      if (item.evidence_id.startsWith("package-candidates:")) return parsePackageEvidence(item);
      if (item.evidence_id.startsWith("erp-candidates:")) return parseErpEvidence(item);
    } catch {
      return fallbackSection(item);
    }
    return fallbackSection(item);
  });
}

function fallbackSection(item: FrozenEvidence): EvidenceSection {
  return { evidenceId: item.evidence_id, title: "其他证据", leftHeading: "证据", rightHeading: "内容", rows: [], fallbackMessage: evidenceFallback };
}

function parsePackageEvidence(item: FrozenEvidence): EvidenceSection {
  const input = JSON.parse(item.content);
  if (!Array.isArray(input)) throw new Error("invalid package candidates");
  const names: Record<string, string> = { title: "配置单标题", item: "产品项", field: "配置字段" };
  const rows = input.flatMap((candidate) => isRecord(candidate) && typeof candidate.value === "string" ? [{
    label: names[String(candidate.source)] ?? String(candidate.source ?? "候选来源"), source: null,
    value: candidate.value, detail: null, choices: [],
  }] : []);
  return { evidenceId: item.evidence_id, title: "产品候选", leftHeading: "来源", rightHeading: "产品名称", rows, fallbackMessage: rows.length ? null : evidenceFallback };
}

function parseErpEvidence(item: FrozenEvidence): EvidenceSection {
  const input = JSON.parse(item.content);
  if (!isRecord(input) || !Array.isArray(input.candidates)) throw new Error("invalid ERP candidates");
  const reasons: Record<string, string> = {
    lookup_timeout: "ERP 查询超时，暂未取得候选",
    lookup_error: "ERP 查询失败，暂未取得候选",
    circuit_open: "ERP 查询已暂停，暂未取得候选",
    no_candidates: "没有找到 ERP 候选",
  };
  const rows = input.candidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const company = String(candidate.company ?? "").trim();
    const partNum = String(candidate.part_num ?? "").trim();
    if (!company && !partNum) return [];
    return [{
      label: [company, partNum].filter(Boolean).join(" / "), source: null,
      value: String(candidate.product_name ?? candidate.erp_product_name ?? "未提供产品名称"),
      detail: typeof candidate.has_bom === "boolean" ? `${candidate.has_bom ? "有" : "无"} BOM` : null,
      choices: [],
    }];
  });
  if (!rows.length) rows.push({ label: "查询状态", source: null, value: reasons[String(input.reason)] ?? "暂未取得 ERP 候选", detail: null, choices: [] });
  return { evidenceId: item.evidence_id, title: "ERP 候选", leftHeading: "公司 / 物料号", rightHeading: "产品信息", rows, fallbackMessage: null };
}

function parseBlockEvidence(item: FrozenEvidence): EvidenceSection {
  const rows: EvidenceDisplayRow[] = [];
  const rowBlocks = item.content.split(/^Row \d+:\s*$/gmu).slice(1);
  for (const block of rowBlocks) {
    const cells = [...block.matchAll(/^\[([A-Z]+\d+)\]\s*(.*)$/gmu)].map((match) => ({ coordinate: match[1], text: match[2].trim() }));
    const optionLine = block.split(/\r?\n/u).find((line) => line.startsWith("option_set: "));
    if (optionLine) {
      const optionSet = JSON.parse(optionLine.slice("option_set: ".length));
      if (isRecord(optionSet) && Array.isArray(optionSet.options)) {
        const choices = optionSet.options.flatMap((option) => isRecord(option) && typeof option.value === "string" && typeof option.selected === "boolean" ? [{ label: option.value, selected: option.selected }] : []);
        const valueCell = cells.at(-1);
        const fieldCell = cells.at(-2) ?? valueCell;
        if (choices.length && fieldCell && valueCell) {
          rows.push({ label: typeof optionSet.field === "string" ? optionSet.field : stripOptionMarks(fieldCell.text), source: `原表 ${valueCell.coordinate}`, value: null, detail: null, choices });
          continue;
        }
      }
    }
    const marked = [...block.matchAll(/\[(SEL| )\]\s*([^\n\[]+)/gu)];
    if (marked.length && cells.length) {
      const valueCell = cells.at(-1)!;
      const fieldCell = cells.find((cell) => !/\[(?:SEL| )\]/u.test(cell.text)) ?? valueCell;
      rows.push({ label: stripOptionMarks(fieldCell.text), source: `原表 ${valueCell.coordinate}`, value: null, detail: null, choices: marked.map((match) => ({ label: match[2].trim(), selected: match[1] === "SEL" })) });
      continue;
    }
    const [field, ...values] = cells;
    const value = values.map((cell) => cell.text).filter(Boolean).join("；");
    if (field?.text && value) rows.push({ label: field.text, source: `原表 ${values[0]?.coordinate ?? field.coordinate}`, value, detail: null, choices: [] });
  }
  return { evidenceId: item.evidence_id, title: "配置选项", leftHeading: "配置项", rightHeading: "可选内容", rows, fallbackMessage: rows.length ? null : evidenceFallback };
}

function stripOptionMarks(value: string) {
  return value.replace(/\[(?:SEL| )\]\s*/gu, "").trim();
}

export function validateForSubmit(annotation: FullReviewAnnotation) {
  const errors: string[] = [];
  const add = (condition: boolean, message: string) => { if (condition && !errors.includes(message)) errors.push(message); };
  add(annotation.package.items.some((item) => item.evidence_refs.length === 0), "产品包必须关联证据");
  add(annotation.configuration_fields.some((field) => field.evidence_refs.length === 0), "关键配置必须关联证据");
  const fieldKeys = annotation.configuration_fields.map((field) => field.field_key.trim());
  add(fieldKeys.some((key) => !key), "配置字段名不能为空");
  add(new Set(fieldKeys).size !== fieldKeys.length, "配置字段名不能重复");
  add(annotation.erp.some((mapping) => mapping.acceptable_identities.some((identity) => identity.evidence_refs.length === 0)), "ERP 身份必须关联证据");
  const sellableIds = annotation.package.items.filter((item) => !nonSellableRoles.has(item.item_role)).map((item) => item.gold_item_id);
  const mappedIds = annotation.erp.map((mapping) => mapping.gold_item_id);
  add(mappedIds.length !== sellableIds.length || new Set(mappedIds).size !== mappedIds.length || mappedIds.some((id) => !sellableIds.includes(id)), "每个可销售项必须且只能有一个 ERP 映射");
  add(annotation.erp.some((mapping) => mapping.decision === "unique_match" && mapping.acceptable_identities.length !== 1), "ERP 唯一匹配必须且只能包含一个身份");
  add(annotation.erp.some((mapping) => mapping.decision === "legitimate_ambiguity" && mapping.acceptable_identities.length < 2), "ERP 歧义必须至少包含两个身份");
  add(annotation.erp.some((mapping) => ["insufficient_evidence", "abstain"].includes(mapping.decision) && mapping.acceptable_identities.length > 0), "ERP 证据不足或弃权时不能选择身份");
  const identityKeys = annotation.erp.flatMap((mapping) => mapping.acceptable_identities.map((identity) => `${identity.company}\u0000${identity.part_num}`));
  add(new Set(identityKeys).size !== identityKeys.length, "ERP 身份不能重复");
  add(["quarantine", "reject"].includes(annotation.admission.decision) && annotation.admission.reason_codes.length === 0, "隔离或拒绝必须选择原因");
  if (annotation.admission.decision === "auto_archive") {
    add(annotation.package.evidence_sufficiency !== "sufficient" || annotation.package.items.length === 0, "自动归档需要证据充分的产品包");
    add(annotation.configuration_fields.some((field) => field.value === null && field.option === null), "自动归档不能包含未解决配置");
    add(annotation.erp.some((mapping) => mapping.decision !== "unique_match" || mapping.acceptable_identities.length !== 1), "自动归档要求每个可销售项唯一匹配 ERP 身份");
  }
  return { passed: errors.length === 0, errors };
}
