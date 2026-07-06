import type { ConceptIssue } from "./conceptResolver.types.js";
import { normalizeAlias } from "./matcher.service.js";

export type ConceptIssueDetectionInput = {
  candidateType: "term_type" | "value";
  rawFieldName?: string | null;
  termType?: string | null;
  rawValue?: string | null;
  sourceRawValue?: string | null;
  splitFromRawValue?: string | null;
  valueKind?: string | null;
  scope?: string | null;
  knownValueAliasTermTypes?: string[];
  occurrenceCount?: number;
};

const COMPOSITE_PATTERN = /[+＋、，,\/／|]|(?:及|和|与|或|;|；)/u;
const UNIT_PATTERN = /\d+(?:\.\d+)?\s*(mm|毫米|cm|m|kg|g|mpa|bar|kw|w|v|ccm|rpm|℃|度)/iu;
const SLASH_UNIT_PATTERN = /^(?:kg\/h|ml\/min|m\/min|l\/min|n\/m|g\/10min)$/iu;
const NON_CONFIG_PATTERN = /^(备注|说明|序号|编号|客户|合同|订单|日期|签字|审核|制表)$/u;
const DOC_SCOPE_PATTERN = /(合同|订单|客户|国家|日期|交期|交货|地址|联系人|电话)/u;
const PLACEHOLDER_VALUE_PATTERN = /^(?:未选中?|无选中项|未填写|未填|未选|不选|空|n\/?a|null|undefined|-|—)$/iu;
const QUALIFIER_PATTERN = /(上模|下模|左侧|右侧|前段|后段|入口|出口|内层|外层|第[一二三四五六七八九十0-9]+|[0-9]+#)/u;
const MULTI_ITEM_PATTERN = /(第[一二三四五六七八九十0-9]+套|[0-9]+#|[一二三四五六七八九十0-9]+号|多套|多台)/u;

export class ConceptIssueDetectorService {
  detect(input: ConceptIssueDetectionInput): ConceptIssue[] {
    const issues = [
      this.detectValueAsType(input),
      this.detectQualifierVariant(input),
      this.detectCompositeValue(input),
      this.detectPlaceholderValue(input),
      this.detectScopeContamination(input),
      this.detectCrossTermTypeValue(input),
      this.detectMultiItemSignal(input),
      this.detectNonConfigNoise(input),
    ].filter(Boolean) as ConceptIssue[];
    return issues.sort((a, b) => b.confidence - a.confidence);
  }

  private detectValueAsType(input: ConceptIssueDetectionInput): ConceptIssue | null {
    if (input.candidateType !== "term_type") return null;
    const normalized = normalizeAlias(input.rawFieldName ?? input.rawValue ?? "");
    const knownTermTypes = input.knownValueAliasTermTypes ?? [];
    if (!normalized || knownTermTypes.length === 0) return null;
    return {
      detector: "ValueAsTypeDetector",
      relationType: "value_as_type",
      recommendedAction: "send_to_review",
      confidence: 0.86,
      riskLevel: "medium",
      reason: "字段名命中了已有枚举值 alias，可能是把 value 当成了字段 Key",
      evidence: { normalizedFieldName: normalized, matchedTermTypes: knownTermTypes },
      blocksAutoApply: true,
    };
  }

  private detectQualifierVariant(input: ConceptIssueDetectionInput): ConceptIssue | null {
    const text = `${input.rawFieldName ?? ""} ${input.rawValue ?? ""}`;
    if (!QUALIFIER_PATTERN.test(text)) return null;
    return {
      detector: "QualifierVariantDetector",
      relationType: "qualifier_variant",
      recommendedAction: "map_as_qualifier_variant",
      confidence: 0.78,
      riskLevel: "medium",
      reason: "候选包含部位、范围或序号限定词，可能是已有概念的 qualifier 变体",
      evidence: { text },
      blocksAutoApply: true,
    };
  }

  private detectCompositeValue(input: ConceptIssueDetectionInput): ConceptIssue | null {
    if (input.candidateType !== "value") return null;
    const rawValue = String(input.rawValue ?? "").trim();
    const sourceRawValue = String(input.sourceRawValue ?? "").trim();
    const text = [rawValue, sourceRawValue].filter(Boolean).join(" ");
    if (!rawValue || !COMPOSITE_PATTERN.test(text)) return null;
    if (input.splitFromRawValue) return null;
    if (SLASH_UNIT_PATTERN.test(rawValue.replace(/\s+/g, ""))) return null;
    if (UNIT_PATTERN.test(rawValue) && !/[、，,\/／|]/u.test(rawValue)) return null;
    return {
      detector: "CompositeValueDetector",
      relationType: "composite_value",
      recommendedAction: "split_value",
      confidence: 0.78,
      riskLevel: "medium",
      reason: "字段值包含多个分隔或并列概念，可能需要拆分而不是创建单一 enum value",
      evidence: { rawValue, sourceRawValue: sourceRawValue || undefined },
      blocksAutoApply: true,
    };
  }

  private detectPlaceholderValue(input: ConceptIssueDetectionInput): ConceptIssue | null {
    if (input.candidateType !== "value") return null;
    const rawValue = String(input.rawValue ?? "").trim();
    if (!PLACEHOLDER_VALUE_PATTERN.test(rawValue)) return null;
    return {
      detector: "PlaceholderValueNoiseDetector",
      relationType: "non_config_noise",
      recommendedAction: "mark_non_config",
      confidence: 0.88,
      riskLevel: "low",
      reason: "字段值是未选/未填写等占位噪声，不应进入枚举字典",
      evidence: { rawValue, termType: input.termType },
      blocksAutoApply: true,
    };
  }

  private detectScopeContamination(input: ConceptIssueDetectionInput): ConceptIssue | null {
    const rawFieldName = String(input.rawFieldName ?? input.termType ?? "");
    const rawValue = String(input.rawValue ?? "");
    const text = `${rawFieldName} ${rawValue}`;
    if (!DOC_SCOPE_PATTERN.test(text)) return null;
    if (input.scope === "document") return null;
    return {
      detector: "ScopeContaminationDetector",
      relationType: "wrong_scope",
      recommendedAction: "move_scope",
      confidence: 0.82,
      riskLevel: "high",
      reason: "候选包含合同/订单/客户等文档级信息，疑似污染产品配置作用域",
      evidence: { rawFieldName, rawValue, scope: input.scope ?? "unknown" },
      blocksAutoApply: true,
    };
  }

  private detectCrossTermTypeValue(input: ConceptIssueDetectionInput): ConceptIssue | null {
    if (input.candidateType !== "value") return null;
    const matches = (input.knownValueAliasTermTypes ?? []).filter((termType) => termType !== input.termType);
    if (matches.length === 0) return null;
    return {
      detector: "CrossTermTypeValueDetector",
      relationType: "different_concept",
      recommendedAction: "send_to_review",
      confidence: 0.83,
      riskLevel: "high",
      reason: "字段值命中了其它 termType 的已有 value alias，可能是跨字段概念错误",
      evidence: { currentTermType: input.termType, matchedTermTypes: matches },
      blocksAutoApply: true,
    };
  }

  private detectMultiItemSignal(input: ConceptIssueDetectionInput): ConceptIssue | null {
    const text = `${input.rawFieldName ?? ""} ${input.rawValue ?? ""}`;
    if (!MULTI_ITEM_PATTERN.test(text)) return null;
    return {
      detector: "MultiItemSignalDetector",
      relationType: "extraction_error",
      recommendedAction: "mark_extraction_error",
      confidence: 0.76,
      riskLevel: "medium",
      reason: "候选带有多 item/实例信号，优先视为 extraction structure 问题",
      evidence: { text },
      blocksAutoApply: true,
    };
  }

  private detectNonConfigNoise(input: ConceptIssueDetectionInput): ConceptIssue | null {
    const field = String(input.rawFieldName ?? "").trim();
    const value = String(input.rawValue ?? "").trim();
    if (!NON_CONFIG_PATTERN.test(field) && !(field.length <= 2 && !value)) return null;
    return {
      detector: "NonConfigNoiseDetector",
      relationType: "non_config_noise",
      recommendedAction: "mark_non_config",
      confidence: 0.8,
      riskLevel: "low",
      reason: "候选字段疑似备注、序号或其它非配置字段",
      evidence: { field, value },
      blocksAutoApply: true,
    };
  }
}

export const conceptIssueDetectorService = new ConceptIssueDetectorService();
