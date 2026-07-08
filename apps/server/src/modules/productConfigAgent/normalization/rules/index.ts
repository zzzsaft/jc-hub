import type { NormalizedRawField, NormalizedWarning } from "../index.js";

export type RuleContext = {
  itemIndex: number;
  productTypeHint?: string | null;
  warnings: NormalizedWarning[];
};

export type FieldParts = {
  key: string;
  value: unknown;
};

const DOCUMENT_INFO_KEYS = new Map<string, string>([
  ["合同号", "contract_number"],
  ["合同编号", "contract_number"],
  ["订单号", "order_number"],
  ["订单编号", "order_number"],
  ["产品编号", "product_number"],
  ["产品号", "product_number"],
  ["模头编号", "product_number"],
  ["客户", "customer_name"],
  ["客户名称", "customer_name"],
  ["客户id", "customer_id"],
  ["客户ID", "customer_id"],
  ["客户编号", "customer_id"],
  ["国家", "country"],
  ["下单日期", "order_date"],
  ["订单日期", "order_date"],
  ["交期", "delivery_date"],
  ["交货日期", "delivery_date"],
  ["日期", "order_date"],
]);

const NOTE_FIELD_PATTERN = /(?:客户.*备注|客户.*特别|客户.*注明|订单备注|特别备注|特别注明|备注)(?:[0-9一二三四])?$/u;
const DIE_FIELD_PATTERN = /(?:模头有效宽度|模头出料有效宽度|模头宽度调节|模唇|口模宽度|口模有效宽度)/u;
const HYDRAULIC_FIELD_PATTERN = /(?:液压站|油箱容量|液压压力|控制方式|电机功率|电机电压)/u;
const LAYER_FIELD_PATTERN = /([A-DＡ-Ｄ])\s*(?:层|区|主机)/i;
const MATERIAL_SELECTOR_PATTERN = /^(其他|其它|特殊|标准)\s+(.+)$/u;

export function routeDocumentInfoKey(key: string): string {
  const trimmed = normalizeFieldKey(key);
  return DOCUMENT_INFO_KEYS.get(trimmed) ?? DOCUMENT_INFO_KEYS.get(trimmed.toLowerCase()) ?? trimmed;
}

export function normalizeFieldKey(key: string): string {
  return String(key ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[：:]+$/g, "")
    .trim();
}

export function applyRawFieldExpansion(
  rawFields: NormalizedRawField[],
  context: RuleContext,
): NormalizedRawField[] {
  const expanded = rawFields.flatMap((field) => expandOneRawField(field, context));
  return groupLayerExtruderConfigFields(expanded, context);
}

export function applyFieldNameRules(
  rawField: NormalizedRawField,
  structured: unknown,
  context: RuleContext,
): FieldParts {
  const originalKey = normalizeFieldKey(rawField.field_name);
  const structuredLabel = applyStructuredLabel(originalKey, structured);
  const indexed = parseIndexedInstanceFieldName(structuredLabel.key);
  const targetKey = indexed?.baseFieldName ?? structuredLabel.key;
  const qualifier = extractQualifier(targetKey, rawField.value, rawField.evidence);
  const explicitQualifier = objectRecord(rawField.qualifier);
  const qualifiedKey = qualifier?.baseFieldName ?? targetKey;
  let value = structuredLabel.value;
  if (qualifier || Object.keys(explicitQualifier).length > 0) {
    value = {
      value,
      qualifier: {
        ...explicitQualifier,
        ...(qualifier?.qualifier ?? {}),
      },
      sourceText: qualifier?.sourceText ?? String(objectRecord(rawField.qualifier).sourceText ?? ""),
    };
  }
  if (indexed) {
    return {
      key: qualifiedKey,
      value: { value, instanceIndex: indexed.instanceIndex },
    };
  }
  return { key: qualifiedKey, value };
}

export function mergePartFields(
  fields: Record<string, unknown>,
  warnings: NormalizedWarning[],
  itemIndex: number,
): Record<string, unknown> {
  const next = { ...fields };
  mergeNumberUnitPart(next, "转速", itemIndex, warnings);
  mergeNumberUnitPart(next, "排量", itemIndex, warnings);
  mergeNumberUnitPart(next, "产量", itemIndex, warnings);
  mergeRangeBound(next, "转速", itemIndex, warnings);
  mergeRangeBound(next, "产量", itemIndex, warnings);
  return next;
}

export function redirectRawFieldProductType(params: {
  rawField: NormalizedRawField;
  currentProductType?: string | null;
  availableProductTypes: Set<string>;
}): string | null {
  const fieldName = compact(params.rawField.field_name);
  if (
    DIE_FIELD_PATTERN.test(fieldName) &&
    params.currentProductType !== "flat_die" &&
    params.availableProductTypes.has("flat_die")
  ) {
    return "flat_die";
  }
  if (
    HYDRAULIC_FIELD_PATTERN.test(fieldName) &&
    params.currentProductType !== "hydraulic_station" &&
    params.availableProductTypes.has("hydraulic_station")
  ) {
    return "hydraulic_station";
  }
  return null;
}

export function isCustomerNoteFieldName(fieldName: string): boolean {
  return NOTE_FIELD_PATTERN.test(compact(fieldName));
}

function expandOneRawField(rawField: NormalizedRawField, context: RuleContext): NormalizedRawField[] {
  if (isExplicitUnselectedOption(rawField)) {
    context.warnings.push({
      type: "unchecked_option_ignored",
      message: "未选中选项不会作为最终值",
      evidence: { fieldName: rawField.field_name, value: rawField.value, rawText: rawField.raw_text },
    });
    return [];
  }
  const fields: NormalizedRawField[] = [];
  for (const split of splitSelectionRawField(rawField, context)) {
    fields.push(...splitCompositeRawField(split, context));
  }
  return fields.flatMap((field) => reparseCustomerNote(field, context));
}

function splitSelectionRawField(rawField: NormalizedRawField, context: RuleContext): NormalizedRawField[] {
  const splitFields = Array.isArray((rawField as any).split_fields) ? (rawField as any).split_fields : [];
  if (splitFields.length === 0) return [rawField];
  const selected = [];
  for (const split of splitFields) {
    const state = splitSelectionState(split.field_name);
    if (state === "unselected") {
      context.warnings.push({
        type: "unchecked_option_ignored",
        message: "未选中选项不会作为最终值",
        evidence: { fieldName: split.field_name, value: split.value },
      });
      continue;
    }
      selected.push({
        ...rawField,
        field_name: state === "selected" ? rawField.field_name : String(split.field_name ?? rawField.field_name),
        value: split.value,
        selected: typeof split.selected === "boolean" ? split.selected : rawField.selected,
        raw_text: String(split.raw_text ?? rawField.raw_text ?? ""),
        qualifier: split.qualifier ?? rawField.qualifier,
        confidence: Number.isFinite(Number(split.confidence)) ? Number(split.confidence) : rawField.confidence,
        evidence: {
          ...objectRecord(split.evidence ?? rawField.evidence),
          originalSplitFieldName: split.field_name,
          splitRule: "selection_split",
        },
    });
  }
  return selected.length > 0 ? selected : [rawField];
}

function isExplicitUnselectedOption(rawField: NormalizedRawField): boolean {
  if (/(?:\(|（)?未选中(?:\)|）)?/u.test(compact(rawField.field_name))) return true;
  const evidenceText = objectRecord(rawField.evidence).text;
  const rawText = [rawField.raw_text, evidenceText]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const hasUnselectedMarker = /\[\s*\]|□/.test(rawText);
  const hasSelectedMarker = /\[SEL\]|■|☑|✔|✓/.test(rawText);
  if (hasUnselectedMarker && !hasSelectedMarker) return true;
  return rawField.selected === false && /(?:未选中|未勾选)/u.test(rawField.field_name);
}

function splitSelectionState(fieldName: string): "selected" | "unselected" | null {
  const name = compact(fieldName);
  if (/(?:\(|（)?未选中(?:\)|）)?/u.test(name)) return "unselected";
  if (/(?:未)?(?:\[|【)\s*(?:SEL|selected)\s*(?:\]|】)/i.test(name)) {
    return name.includes("未") ? "unselected" : "selected";
  }
  if (/(?:\(|（)?选中(?:\)|）)?/u.test(name)) return "selected";
  return null;
}

function splitCompositeRawField(rawField: NormalizedRawField, context: RuleContext): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  const result: NormalizedRawField[] = [];
  if (/(?:测温孔|热电偶孔).*(?:压力孔|压力传感器孔)|(?:压力孔|压力传感器孔).*(?:测温孔|热电偶孔)/u.test(fieldName)) {
    result.push(makeDerivedField(rawField, "热电偶孔规格", rawField.value, "thermocouple_pressure_hole_composite"));
    result.push(makeDerivedField(rawField, "压力传感器孔配置", rawField.value, "thermocouple_pressure_hole_composite"));
    return result;
  }
  const voltageParts = splitVoltageFrequencyPhase(rawField);
  if (voltageParts.length > 0) return voltageParts;
  const materialParts = splitMaterialSelector(rawField);
  if (materialParts.length > 0) return materialParts;
  const deckleParts = splitDeckleComposite(rawField);
  if (deckleParts.length > 0) return deckleParts;
  const lipParts = splitLipAdjustmentComposite(rawField);
  if (lipParts.length > 0) return lipParts;
  const plugParts = splitPlugConnectionComposite(rawField);
  if (plugParts.length > 0) return plugParts;
  const feedParts = splitFeedInletComposite(rawField);
  if (feedParts.length > 0) return feedParts;
  const mountingParts = splitMountingComposite(rawField);
  if (mountingParts.length > 0) return mountingParts;
  const plasticParts = splitPlasticMaterialComposite(rawField);
  if (plasticParts.length > 0) return plasticParts;
  const layerComponents = splitLayerConfigComposite(rawField);
  if (layerComponents.length > 0) return layerComponents;
  return [rawField];
}

function splitVoltageFrequencyPhase(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  if (!/(?:电压|电源电压|电压及加热功率)/u.test(fieldName)) return [];
  const text = sourceText(rawField);
  const voltage = text.match(/([0-9]+(?:\.[0-9]+)?)\s*V/iu)?.[1];
  const frequency = text.match(/([0-9]+(?:\.[0-9]+)?)\s*Hz/iu)?.[1];
  const phase = text.match(/(单\s*相|三\s*相)/u)?.[1]?.replace(/\s+/g, "");
  const power = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:kW|KW|kw|千瓦)/u)?.[1];
  const result: NormalizedRawField[] = [];
  if (voltage) result.push(makeDerivedField(rawField, "加热电压", `${voltage}V`, "voltage_frequency_phase_split"));
  if (frequency) result.push(makeDerivedField(rawField, "加热频率", `${frequency}Hz`, "voltage_frequency_phase_split"));
  if (phase) result.push(makeDerivedField(rawField, "相", phase, "voltage_frequency_phase_split"));
  if (power) result.push(makeDerivedField(rawField, "加热功率", `${power}kW`, "voltage_frequency_phase_split"));
  return result.length >= 2 || (fieldName.includes("加热功率") && result.length > 0) ? result : [];
}

function splitMaterialSelector(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  if (!/(?:材质|材料)/u.test(fieldName)) return [];
  const match = String(rawField.value ?? "").trim().match(MATERIAL_SELECTOR_PATTERN);
  if (!match) return [];
  return [
    {
      ...makeDerivedField(rawField, rawField.field_name, match[2].trim(), "material_selector_split"),
      qualifier: { selector: match[1], sourceText: match[1] },
    },
  ];
}

function splitFeedInletComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  if (!/(?:进料口|进料方式)/u.test(fieldName)) return [];
  const value = String(rawField.value ?? "").trim();
  if (!value || !/(?:尺寸|图纸|要求|\*|互配|与\s*\d+)/u.test(value)) return [];
  const method = value
    .replace(/\*+/g, " ")
    .replace(/按.*$/u, "")
    .replace(/进料口尺寸.*$/u, "")
    .replace(/[（(]\s*与?\d+.*?[）)]/gu, "")
    .replace(/与?\d+\s*互配使用/gu, "")
    .replace(/需方提供尺寸/u, "")
    .trim();
  const result: NormalizedRawField[] = [];
  if (method) result.push(makeDerivedField(rawField, "进料口方式", method, "feed_inlet_composite_split"));
  const referenceDie = value.match(/与?\s*(\d{4,})\s*(?:互配使用)?/u)?.[1];
  if (referenceDie) result.push(makeDerivedField(rawField, "参考模头", referenceDie, "feed_inlet_composite_split"));
  const sizeText = value.match(/(?:尺寸|要求).*/u)?.[0] ?? value.match(/按.+$/u)?.[0];
  if (sizeText) result.push(makeDerivedField(rawField, "进料口尺寸", sizeText.replace(/\*+/g, "").trim(), "feed_inlet_composite_split"));
  return result.length > 1 ? result : [];
}

function splitMountingComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  if (!/(?:安装方式|挤出安装)/u.test(fieldName)) return [];
  const value = String(rawField.value ?? "").trim();
  const centerDistance = value.match(/中心距\s*([0-9]+(?:\.[0-9]+)?\s*mm)/iu)?.[1];
  if (!centerDistance) return [];
  return [
    makeDerivedField(rawField, rawField.field_name, value.replace(/[（(].*?中心距.*?[）)]/u, "").trim(), "mounting_composite_split"),
    makeDerivedField(rawField, "安装中心距", centerDistance, "mounting_composite_split"),
  ];
}

function splitPlasticMaterialComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  if (!/(?:适用塑料原料|适用原料|塑料原料)/u.test(fieldName)) return [];
  const value = String(rawField.value ?? "").trim();
  if (!value) return [];
  if (/(?:\bmfi|\bat\s*\d|g\s*\/?\s*10\s*min|°c|℃)/iu.test(value)) return [];
  const material = value.match(/\b(?:WPC|PET|CPE|PP|PVDF|LDPE|LLDPE|HDPE|PVC|ABS|PE|EVA|POE|PC|GPPS|PMMA|PS)\b/iu)?.[0];
  const capacity = value.match(/(?:产量|排量)?\s*([0-9]+(?:\.[0-9]+)?(?:\s*[-~～至到]\s*[0-9]+(?:\.[0-9]+)?)?)\s*(?:KG|kg)\s*(?:\/\s*每?|每)\s*(?:H|h|小时)/u)?.[1];
  const adjustment = value.match(/(手动|自动)(?:模头)?/u)?.[1];
  const application = value
    .replace(/\b(?:WPC|PET|CPE|PP|PVDF|LDPE|LLDPE|HDPE|PVC|ABS|PE|EVA|POE|PC|GPPS|PMMA|PS)\b/giu, "")
    .replace(/[（(].*?[）)]/gu, "")
    .replace(/(?:产量|排量).*/u, "")
    .replace(/客户要求.*$/u, "")
    .replace(/(?:手动|自动)/gu, "")
    .trim()
    .replace(/模头$/u, "")
    .trim();
  const result: NormalizedRawField[] = [];
  if (material) result.push(makeDerivedField(rawField, rawField.field_name, material.toUpperCase(), "plastic_material_composite_split"));
  if (application) result.push(makeDerivedField(rawField, "应用", application, "plastic_material_composite_split"));
  if (adjustment) result.push(makeDerivedField(rawField, "唇调节方式", adjustment, "plastic_material_composite_split"));
  if (capacity) result.push(makeDerivedField(rawField, "产量", `${capacity}kg/h`, "plastic_material_composite_split"));
  return result.length > 1 ? result : [];
}

function splitDeckleComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  const value = String(rawField.value ?? "").trim();
  if (!/(?:堵边|调幅|堵式)/u.test(fieldName + value)) return [];
  const deckle = value.match(/(?:外|内)堵式/u)?.[0];
  const width = value.match(/单边挡\s*([0-9]+(?:\.[0-9]+)?\s*mm)/iu)?.[1];
  if (!deckle || !width) return [];
  return [
    makeDerivedField(rawField, rawField.field_name, deckle, "deckle_composite_split"),
    makeDerivedField(rawField, "单边挡块宽度", width, "deckle_composite_split"),
  ];
}

function splitLipAdjustmentComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  const value = String(rawField.value ?? "").trim();
  if (!/(?:唇调节|唇.*调节方式)/u.test(fieldName)) return [];
  const parts = value.split(/[;；]/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => makeDerivedField(rawField, rawField.field_name, part, "lip_adjustment_composite_split"));
  }
  const range = value.match(/([0-9]+(?:\.[0-9]+)?\s*mm)\s*可调/u)?.[1];
  return range ? [makeDerivedField(rawField, "模唇厚度调节范围", range, "lip_adjustment_composite_split")] : [];
}

function splitPlugConnectionComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const fieldName = compact(rawField.field_name);
  const value = String(rawField.value ?? "").trim();
  if (!/加热方式/u.test(fieldName) || !/航空插头/u.test(value)) return [];
  return [makeDerivedField(rawField, "接插接要求", value.replace(/^特殊[：:]?/u, "").trim(), "plug_connection_composite_split")];
}

function splitLayerConfigComposite(rawField: NormalizedRawField): NormalizedRawField[] {
  const text = [rawField.field_name, rawField.value, (rawField as any).raw_text, objectRecord(rawField.evidence).text]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!LAYER_FIELD_PATTERN.test(text)) return [];
  const components: string[] = [];
  const model = text.match(/((?:SJ[-\s]?)?(?:[Φφ]\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:mm|毫米)?)(?:\s*(?:挤出机|螺杆|主机))/i)?.[1];
  const output = text.match(/(?:产量|产能)?\s*([0-9]+(?:\.[0-9]+)?\s*(?:kg\/h|kg\s*\/\s*h|公斤\/小时|千克\/小时))/i)?.[1];
  const material = text.match(/(?:原料|材料|树脂)[:：]?\s*([A-Za-z0-9+\-_/／、，,]+)(?=$|[\s，,；;])/i)?.[1];
  if (model) components.push(`型号=${model.trim()}`);
  if (output) components.push(`产量=${output.trim()}`);
  if (material) components.push(`原料=${material.trim()}`);
  return components.length >= 2
    ? [makeDerivedField(rawField, "挤出机型号", components.join("；"), "layer_config_composite")]
    : [];
}

function groupLayerExtruderConfigFields(rawFields: NormalizedRawField[], context: RuleContext): NormalizedRawField[] {
  const groups = new Map<string, { firstIndex: number; fields: NormalizedRawField[] }>();
  rawFields.forEach((field, index) => {
    const text = [field.field_name, field.value, objectRecord(field.evidence).text].map((item) => String(item ?? "")).join(" ");
    const match = text.match(LAYER_FIELD_PATTERN);
    if (!match?.[1] || !/(?:挤出机|主机|螺杆|型号|产量|产能)/u.test(text)) return;
    const layer = normalizeLayer(match[1]);
    const group = groups.get(layer) ?? { firstIndex: index, fields: [] };
    group.fields.push(field);
    groups.set(layer, group);
  });
  const replacements = new Map<number, NormalizedRawField>();
  const removed = new Set<number>();
  for (const [layer, group] of groups.entries()) {
    if (group.fields.length < 2 && !/(?:挤出机|主机|螺杆|型号|产量|产能)/u.test(String(group.fields[0]?.field_name ?? ""))) continue;
    replacements.set(group.firstIndex, {
      item_index: context.itemIndex,
      field_name: "挤出机型号",
      value: group.fields.map((field) => `${field.field_name}=${field.value}`).join("；"),
      evidence: { source: "layer_extruder_config_group", layer, sourceFields: group.fields },
      confidence: Math.min(...group.fields.map((field) => field.confidence ?? 0.8)),
    });
    for (const field of group.fields) {
      const index = rawFields.indexOf(field);
      if (index >= 0) removed.add(index);
    }
  }
  if (replacements.size === 0) return rawFields;
  return rawFields.flatMap((field, index) => {
    const replacement = replacements.get(index);
    if (replacement) return [replacement];
    return removed.has(index) ? [] : [field];
  });
}

function reparseCustomerNote(rawField: NormalizedRawField, context: RuleContext): NormalizedRawField[] {
  if (!isCustomerNoteFieldName(rawField.field_name)) return [rawField];
  const text = String(rawField.value ?? "");
  const derived: NormalizedRawField[] = [];
  for (const match of text.matchAll(/(上模|下模|上下模)?\s*加热棒(?:角度)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:°|度)/gu)) {
    const targets = match[1] === "上下模" ? ["上模", "下模"] : [match[1] ?? ""];
    for (const target of targets) {
      derived.push(makeDerivedField(rawField, `${target}加热棒角度`, `${match[2]}°`, "customer_note_reparse"));
    }
  }
  const direction = text.match(/测温孔方向\s*(?:朝|向|为|:|：)?\s*([^,，;；。\n]+)/u)?.[1]?.trim();
  if (direction) derived.push(makeDerivedField(rawField, "测温孔方向", direction, "customer_note_reparse"));
  context.warnings.push({
    type: "customer_note_retained",
    message: "客户备注已保留，并尝试解析为结构化字段",
    evidence: { fieldName: rawField.field_name, value: rawField.value },
  });
  return [rawField, ...derived];
}

function applyStructuredLabel(fieldName: string, value: unknown): FieldParts {
  if (
    /(?:复合比例|层比例|层配比|层占比|[A-Ea-e一二三四五六七八九十表芯中间内外上下]层.*(?:原料|材料|材质|产量)|挤出机.*型号|泵[前后]压力|模唇.*(?:厚度|开口|间隙))/u.test(fieldName)
  ) {
    return { key: fieldName, value: { label: fieldName, value } };
  }
  return { key: fieldName, value };
}

export function parseIndexedInstanceFieldName(fieldName: string): { baseFieldName: string; instanceIndex: number } | null {
  const trimmed = fieldName.trim();
  const match = trimmed.match(/^(.+?)(?:[\s_-]*(?:#|第)?(\d+)(?:组|号|段|层|区)?)$/);
  if (!match) return null;
  const baseFieldName = normalizeFieldKey(match[1]);
  const instanceIndex = Number(match[2]);
  if (!baseFieldName || !Number.isFinite(instanceIndex) || instanceIndex <= 0) return null;
  return { baseFieldName, instanceIndex };
}

function extractQualifier(fieldName: string, rawValue: unknown, evidence: unknown) {
  const source = [fieldName, objectRecord(evidence).originalSplitFieldName, objectRecord(evidence).text, rawValue]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const position = source.match(/上模|下模|入口|出口|左|右|内|外|前|后/u)?.[0];
  const area = source.match(/分配器主体|产品主体|侧板|模唇|泵体|网前|网后/u)?.[0];
  if (!position && !area) return null;
  if (!position && area === "模唇" && !/(?:加热|数量|厚度)/u.test(fieldName)) return null;
  const baseFieldName = fieldName.replace(/(上模|下模|入口|出口|左|右|内|外|前|后|分配器主体|产品主体|侧板|模唇|泵体|网前|网后)$/u, "");
  return { baseFieldName: baseFieldName || fieldName, qualifier: { position, area }, sourceText: position ?? area };
}

function mergeNumberUnitPart(fields: Record<string, unknown>, base: string, itemIndex: number, warnings: NormalizedWarning[]) {
  const value = fields[`${base}数值`] ?? fields[`数值${base}`];
  const unit = fields[`${base}单位`] ?? fields[`单位${base}`];
  if (value === undefined || unit === undefined || fields[base] !== undefined) return;
  fields[base] = `${scalarForMerge(value)}${scalarForMerge(unit)}`;
  delete fields[`${base}数值`];
  delete fields[`数值${base}`];
  delete fields[`${base}单位`];
  delete fields[`单位${base}`];
  warnings.push({ type: "number_unit_part_fields_merged", message: "数值/单位字段已合并", evidence: { itemIndex, base } });
}

function mergeRangeBound(fields: Record<string, unknown>, base: string, itemIndex: number, warnings: NormalizedWarning[]) {
  const min = fields[`${base}最小值`] ?? fields[`${base}最小`] ?? fields[`最小值${base}`] ?? fields[`最小${base}`];
  const max = fields[`${base}最大值`] ?? fields[`${base}最大`] ?? fields[`最大值${base}`] ?? fields[`最大${base}`];
  if (min === undefined || max === undefined || fields[base] !== undefined) return;
  fields[base] = `${scalarWithUnitForMerge(min)} - ${scalarWithUnitForMerge(max)}`;
  for (const key of [`${base}最小值`, `${base}最小`, `最小值${base}`, `最小${base}`, `${base}最大值`, `${base}最大`, `最大值${base}`, `最大${base}`]) {
    delete fields[key];
  }
  warnings.push({ type: "range_bound_fields_merged", message: "最大值/最小值字段已合并", evidence: { itemIndex, base } });
}

function makeDerivedField(source: NormalizedRawField, fieldName: string, value: unknown, splitRule: string): NormalizedRawField {
  return {
    ...source,
    field_name: fieldName,
    value,
    evidence: {
      ...objectRecord(source.evidence),
      sourceRawFieldName: source.field_name,
      sourceRawValue: source.value,
      splitRule,
    },
  };
}

function normalizeLayer(value: string): string {
  return value.replace(/[Ａ-Ｄ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).toUpperCase();
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function scalarForMerge(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.value !== undefined) return scalarForMerge(record.value);
    if (record.raw_value !== undefined) return scalarForMerge(record.raw_value);
  }
  return String(value ?? "").trim();
}

function scalarWithUnitForMerge(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const scalar = scalarForMerge(record.value ?? record.raw_value ?? value);
    const unit = scalarForMerge(record.unit);
    return unit && !scalar.endsWith(unit) ? `${scalar}${unit}` : scalar;
  }
  return scalarForMerge(value);
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function sourceText(rawField: NormalizedRawField): string {
  return [rawField.field_name, rawField.value, rawField.raw_text, objectRecord(rawField.evidence).text]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
