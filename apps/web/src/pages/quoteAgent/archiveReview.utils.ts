import type {
  ArchiveItemField,
  BatchReviewResponse,
  ExtractionDetail,
  ProductBinding,
  ProductBindingPayload,
  QuoteAgentField,
  QuoteAgentItem,
} from "./types";
import { asArray, textValue } from "./common.utils";
import { fieldDisplayName, fieldDisplayValue } from "./field.utils";

export const bindingToPayload = (binding: ProductBinding): ProductBindingPayload => ({
  productNumber: String(binding.productNumber ?? "").trim(),
  role: binding.role || "unknown",
  quantity: binding.quantity ?? null,
  bindingSource: binding.bindingSource || "manual",
  confidence: binding.confidence ?? null,
  erpProductId: binding.erpProductId ?? null,
  erpParentProductNumber: binding.erpParentProductNumber ?? null,
  erpMatchStatus: binding.erpMatchStatus || "manual",
  priceAmount: binding.price?.amount ?? null,
  priceCurrency: binding.price?.currency ?? null,
  priceSource: binding.price?.source ?? null,
  evidence: binding.evidence,
  note: binding.note ?? null,
});

export const changeSummaryText = (value: unknown) => {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => changeSummaryText(item)).join("；");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const path = textValue(record.path, "");
    if (path) {
      const after = record.after ?? record.value;
      if (/^items\.\d+\.fields$/.test(path)) {
        const before = record.before;
        if (Array.isArray(before) && Array.isArray(after)) {
          const maxLength = Math.max(before.length, after.length);
          const changedCount = Array.from({ length: maxLength }).filter((_, index) => JSON.stringify(before[index] ?? null) !== JSON.stringify(after[index] ?? null)).length;
          return `${path}: 更新字段${changedCount ? ` ${changedCount} 项` : ""}`;
        }
        return `${path}: 更新字段列表`;
      }
      if (Array.isArray(after)) return `${path}: 更新列表 ${after.length} 项`;
      if (after && typeof after === "object") return `${path}: 更新对象`;
      return `${path}: ${textValue(after)}`;
    }
    return Object.entries(record).map(([key, item]) => {
      if (Array.isArray(item)) return `${key}: 列表 ${item.length} 项`;
      if (item && typeof item === "object") return `${key}: 对象`;
      return `${key}: ${textValue(item)}`;
    }).join("；");
  }
  return String(value);
};

export type ChangeSummaryDetail = {
  label: string;
  before: string;
  after: string;
};

export function changeSummaryDetails(value: unknown): ChangeSummaryDetail[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const path = textValue(record.path, "");
    const before = record.before;
    const after = record.after ?? record.value;
    if (/^items\.\d+\.fields$/.test(path) && Array.isArray(before) && Array.isArray(after)) {
      const maxLength = Math.max(before.length, after.length);
      return Array.from({ length: maxLength }).flatMap((_, index) => {
        const beforeField = before[index] as ArchiveItemField | QuoteAgentField | undefined;
        const afterField = after[index] as ArchiveItemField | QuoteAgentField | undefined;
        if (JSON.stringify(beforeField ?? null) === JSON.stringify(afterField ?? null)) return [];
        const field = afterField || beforeField;
        return [{
          label: field ? fieldDisplayName(field) : `${path}.${index}`,
          before: beforeField ? textValue(fieldDisplayValue(beforeField), "空") : "空",
          after: afterField ? textValue(fieldDisplayValue(afterField), "空") : "空",
        }];
      });
    }
    if (path) {
      return [{
        label: path,
        before: textValue(before, "空"),
        after: textValue(after, "空"),
      }];
    }
    return [];
  });
}

export const detailItems = (detail?: ExtractionDetail | null): QuoteAgentItem[] =>
  asArray(
    detail?.items ||
      (detail as any)?.dictionary_proposals?.items ||
      (detail as any)?.dictionary?.items ||
      (detail as any)?.extraction?.items ||
      (detail as any)?.data?.items,
  );
export const detailWarnings = (detail?: ExtractionDetail | null) =>
  asArray(detail?.warnings || (detail as any)?.dictionary_proposals?.warnings || (detail as any)?.dictionary?.warnings || (detail as any)?.data?.warnings);

export function resultMessage(result: BatchReviewResponse) {
  if (result?.successCount !== undefined || result?.failedCount !== undefined) {
    const affected = Array.isArray(result.affectedDocumentIds) ? result.affectedDocumentIds.length : 0;
    return `提交完成：成功 ${result.successCount ?? 0}，失败 ${result.failedCount ?? 0}，影响文档 ${affected} 个。`;
  }
  if (Array.isArray(result?.affectedDocumentIds)) return `提交完成：影响文档 ${result.affectedDocumentIds.length} 个。`;
  return "操作完成。";
}

export function batchResultMessage(result: BatchReviewResponse) {
  const base = resultMessage(result);
  return result?.candidateRecheckDeferred
    ? `${base}审核已提交，相关文档将在后台刷新。`
    : base;
}
