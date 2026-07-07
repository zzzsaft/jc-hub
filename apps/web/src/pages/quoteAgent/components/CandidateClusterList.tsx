import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/core";
import { clusterIdentity, clusterKeySummary, operationsFromClusters } from "../candidateCluster.utils";
import type { CandidateCluster, ReviewOperation } from "../types";
import { asArray, json } from "../utils";
import { CandidateClusterSuggestionCard } from "./CandidateClusterSuggestionCard";

interface Props {
  clusters: CandidateCluster[];
  expandedClusterIds: string[];
  selectedClusterIds: string[];
  loading: boolean;
  submitting: boolean;
  onToggleExpanded: (clusterId: string) => void;
  onToggleSelected: (clusterId: string) => void;
  onRetry: (cluster: CandidateCluster) => void;
  onOpenManualReview: (cluster: CandidateCluster) => void;
}

const reviewer = "Codex";
const display = (value: unknown) => String(value ?? "-");
const listText = (value: unknown[]) => (value.length ? value.join(" / ") : "-");

const operationsWithReviewer = (operations: ReviewOperation[]) =>
  operations.map((operation) => ({
    ...operation,
    payload: {
      reviewedBy: reviewer,
      ...operation.payload,
    },
  }));

const requestPayloadForCluster = (cluster: CandidateCluster) => {
  const operations = operationsFromClusters([cluster]);
  return {
    endpoint: "POST /productConfigAgent/candidates/reviews/batch",
    requestBody: {
      deferCandidateRecheck: true,
      operations: operationsWithReviewer(operations),
    },
  };
};

export function CandidateClusterList(props: Props) {
  const [payloadCluster, setPayloadCluster] = useState<CandidateCluster | null>(null);
  const payloadPreview = useMemo(
    () => (payloadCluster ? requestPayloadForCluster(payloadCluster) : null),
    [payloadCluster],
  );

  if (props.loading) {
    return <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">正在加载候选簇</div>;
  }

  if (!props.clusters.length) {
    return <div className="border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">暂无待审核候选簇。</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {props.clusters.map((cluster) => {
          const id = clusterIdentity(cluster);
          const expanded = props.expandedClusterIds.includes(id);
          const selected = props.selectedClusterIds.includes(id);
          const candidateIds = asArray(cluster.candidateIds);
          const samples = asArray(cluster.sampleOccurrences);
          return (
            <article key={id} className="border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{display(cluster.candidateType)}</span>
                    <h2 className="min-w-0 break-words text-base font-semibold text-slate-950">{clusterKeySummary(cluster)}</h2>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-px bg-slate-200 text-sm md:grid-cols-5">
                    {[
                      ["候选数量", candidateIds.length],
                      ["涉及文档", cluster.documentCount ?? 0],
                      ["出现次数", cluster.occurrenceCount ?? 0],
                      ["产品类型", display(cluster.sourceProductType)],
                      ["termType", display(cluster.termType)],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-slate-50 px-3 py-2">
                        <div className="font-semibold text-slate-900">{value}</div>
                        <div className="text-xs text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 lg:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-400">原因</dt>
                      <dd className="mt-1 break-words">{display(cluster.reason)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">常见 raw field</dt>
                      <dd className="mt-1 break-words">{listText(asArray(cluster.rawFieldNameSamples))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">常见 raw value</dt>
                      <dd className="mt-1 break-words">{listText(asArray(cluster.rawValueSamples))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">常见上下文</dt>
                      <dd className="mt-1 break-words">{listText(asArray(cluster.commonContexts))}</dd>
                    </div>
                  </dl>

                  {cluster.submitError && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <span>{cluster.submitError}</span>
                      <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={props.submitting} onClick={() => props.onRetry(cluster)}>
                        单独重试
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={() => props.onToggleExpanded(id)}>
                      {expanded ? "收起样例" : "展开样例与 candidateIds"}
                    </button>
                    <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => props.onOpenManualReview(cluster)}>
                      手动审批
                    </button>
                    <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => setPayloadCluster(cluster)}>
                      查看 payload
                    </button>
                  </div>
                </div>

                <CandidateClusterSuggestionCard
                  cluster={cluster}
                  checked={selected}
                  disabled={props.submitting}
                  onToggle={() => props.onToggleSelected(id)}
                />
              </div>

              {expanded && (
                <div className="border-t border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 text-xs font-semibold text-slate-500">candidateIds</div>
                  <div className="mb-4 break-words border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                    {candidateIds.length ? candidateIds.join(", ") : "-"}
                  </div>
                  <div className="overflow-x-auto border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">document</th>
                          <th className="px-3 py-2 font-medium">item</th>
                          <th className="px-3 py-2 font-medium">rawFieldName</th>
                          <th className="px-3 py-2 font-medium">rawValue</th>
                          <th className="px-3 py-2 font-medium">context</th>
                        </tr>
                      </thead>
                      <tbody>
                        {samples.map((sample, index) => (
                          <tr key={`${id}:${index}`} className="border-t border-slate-100">
                            <td className="max-w-48 px-3 py-2 align-top">{display(sample.fileName ?? sample.document ?? sample.documentName ?? sample.documentId)}</td>
                            <td className="px-3 py-2 align-top">{display(sample.itemName ?? sample.item ?? sample.itemIndex)}</td>
                            <td className="max-w-56 px-3 py-2 align-top">{display(sample.rawFieldName)}</td>
                            <td className="max-w-56 px-3 py-2 align-top">{display(sample.rawValue)}</td>
                            <td className="max-w-96 px-3 py-2 align-top">{display(sample.context)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!samples.length && <div className="px-3 py-4 text-center text-xs text-slate-500">暂无样例</div>}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-slate-500">查看原始簇数据</summary>
                    <pre className="mt-2 max-h-80 overflow-auto border border-slate-200 bg-white p-3 text-xs text-slate-700">{json(cluster)}</pre>
                  </details>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <Modal
        open={Boolean(payloadCluster)}
        title="单条提交 payload"
        width={860}
        footer={null}
        onCancel={() => setPayloadCluster(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            这里展示的是点击“单独重试”或只勾选这一条后提交到批量审核接口的请求体。
          </p>
          {payloadPreview?.requestBody.operations.length ? (
            <pre className="max-h-[60vh] overflow-auto rounded border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {json(payloadPreview)}
            </pre>
          ) : (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              当前这条还没有可提交的审核操作。需要先生成 AI 建议，或点击“手动审批”保存一条操作。
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
