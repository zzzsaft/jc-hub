import type {
  BatchReviewResponse,
  CandidateCluster,
} from "./types";
import { asArray } from "./common.utils";

export function failureCandidateIds(result: BatchReviewResponse) {
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const ids = new Set<string>();
  failedItems.forEach((item: any) => {
    const id = item.candidateId ?? item.candidate_id ?? item.operation?.candidateId ?? item.operation?.candidate_id;
    if (id !== undefined && id !== null) ids.add(String(id));
  });
  return ids;
}

export function failureReasonsByCandidateId(result: BatchReviewResponse) {
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const reasons = new Map<string, string>();
  failedItems.forEach((item: any) => {
    const id = item.candidateId ?? item.candidate_id ?? item.operation?.candidateId ?? item.operation?.candidate_id;
    const reason = item.error ?? item.message ?? item.reason ?? item.detail ?? item.details ?? item.response?.data?.message;
    if (id !== undefined && id !== null && reason) reasons.set(String(id), String(reason));
  });
  return reasons;
}

export function firstFailureReason(result: BatchReviewResponse) {
  const reasons = Array.from(failureReasonsByCandidateId(result).values());
  if (reasons.length) return reasons[0];
  const failedItems = [
    ...asArray(result.failures),
    ...asArray(result.failedOperations),
    ...asArray(result.results).filter((item: any) => item?.success === false || item?.error),
  ];
  const item = failedItems.find(Boolean) as any;
  return String(item?.error ?? item?.message ?? item?.reason ?? "");
}

export function clusterKeySummary(cluster: CandidateCluster) {
  if (cluster.candidateType === "term_type") return cluster.normalizedFieldName || cluster.clusterKey || "-";
  return [cluster.termType, cluster.normalizedRawValue].filter(Boolean).join(" / ") || cluster.clusterKey || "-";
}

export function batchResultText(result: BatchReviewResponse) {
  const affected = Array.isArray(result.affectedDocumentIds) ? result.affectedDocumentIds.length : 0;
  const successCount = result.successCount ?? 0;
  const failedCount = result.failedCount ?? 0;
  if (failedCount > 0 && successCount > 0) {
    const reason = firstFailureReason(result);
    return `部分提交失败：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。${reason ? `原因：${reason}` : "失败行已保留，可单独重试。"}`;
  }
  if (failedCount > 0) {
    const reason = firstFailureReason(result);
    return `提交失败：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。${reason ? `原因：${reason}` : "请检查失败行后单独重试。"}`;
  }
  return `提交成功：成功 ${successCount}，失败 ${failedCount}，受影响文档 ${affected} 个。`;
}

export function batchResultHasFailure(result: BatchReviewResponse) {
  return Number(result.failedCount ?? 0) > 0;
}
