import type { ArchiveItem, QuoteAgentItem } from "../../types";
import { itemMasterDataStatus, masterDataModel } from "../masterData";
import { JsonBlock } from "./JsonBlock";

type Props = {
  item: ArchiveItem | QuoteAgentItem;
};

export function MasterDataStatus({ item }: Props) {
  const status = itemMasterDataStatus(item);
  const model = masterDataModel(status.match);

  if (status.match?.matched) {
    return (
      <span
        className="inline-flex max-w-full items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        title={status.tooltip || undefined}
      >
        主数据已绑定：{model || "-"}
      </span>
    );
  }

  if (status.needsReviewWarning) {
    return (
      <details className="group relative">
        <summary className="inline-flex cursor-pointer list-none items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          主数据候选 {status.candidates.length} 个
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-[min(520px,calc(100vw-32px))] rounded border border-amber-200 bg-white p-3 text-xs shadow-lg">
          <div className="mb-2 font-semibold text-slate-800">主数据候选</div>
          {status.candidates.length ? (
            <div className="space-y-2">
              {status.candidates.map((candidate, index) => (
                <div key={`${candidate.model}-${candidate.source}-${index}`} className="rounded border border-slate-200 p-2">
                  <div className="font-medium text-slate-900">{candidate.model || "-"}</div>
                  <div className="mt-1 text-slate-500">source: {candidate.source || "-"}</div>
                  {candidate.matchedAttributes.length > 0 && (
                    <InfoLine label="命中属性" value={candidate.matchedAttributes.join("、")} />
                  )}
                  {candidate.conflicts.length > 0 && <InfoLine label="冲突" value={candidate.conflicts.join("；")} tone="bad" />}
                  {candidate.missingAttributes.length > 0 && (
                    <InfoLine label="缺失" value={candidate.missingAttributes.join("、")} tone="muted" />
                  )}
                  {candidate.confidenceReason && <InfoLine label="原因" value={candidate.confidenceReason} />}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500">暂无候选明细</div>
          )}
          <div className="mt-2 text-slate-500">候选仅用于人工确认提示，不会进入字段别名审批。</div>
          <JsonBlock title=" 候选依据" value={status.needsReviewWarning.evidence ?? status.needsReviewWarning} />
        </div>
      </details>
    );
  }

  if (status.noMatchWarning) {
    return (
      <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        主数据未匹配
      </span>
    );
  }

  return null;
}

export function DerivedMasterDataModelRow({ item }: Props) {
  const status = itemMasterDataStatus(item);
  const model = masterDataModel(status.match);
  if (!status.derivedModelWithoutOriginalField || !model) return null;

  return (
    <div className="mb-3 rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      反推型号：<span className="font-medium">{model}</span>
      {status.matchedAttributes.length > 0 && (
        <span className="ml-2 text-xs text-emerald-700">命中属性：{status.matchedAttributes.join("、")}</span>
      )}
    </div>
  );
}

function InfoLine({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "bad" | "muted" }) {
  const color = tone === "bad" ? "text-rose-700" : tone === "muted" ? "text-slate-500" : "text-slate-700";
  return (
    <div className={`mt-1 break-words ${color}`}>
      <span className="text-slate-500">{label}：</span>
      {value}
    </div>
  );
}
