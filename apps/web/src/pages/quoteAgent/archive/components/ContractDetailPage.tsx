import { Link } from "react-router-dom";
import { useContractDetailState } from "../hooks/useContractDetailState";
import { FieldTable } from "./FieldTable";
import { JsonBlock } from "./JsonBlock";
import { DerivedMasterDataModelRow, MasterDataStatus } from "./MasterDataStatus";
import type { ArchiveItemField, QuoteAgentField } from "../../types";
import { formatDateTime, isMainConfigField, isUnmatchedConfigField, textValue } from "../../utils";
import { archiveClass } from "../classNames";

export function ContractDetailPage() {
  const state = useContractDetailState();
  const readiness = state.readiness;
  const archiveAllowed = state.status === "normalized" && Boolean(readiness?.canArchive || readiness?.forceRequired);
  const archiveDisabled = state.loading || state.readinessLoading || !archiveAllowed || state.archiving;
  const archiveText = state.archiving
    ? "归档中"
    : readiness?.forceRequired
      ? "强制归档"
      : "归档";

  return (
    <div className={archiveClass("qa-archive-page")}>
      <div className={archiveClass("qa-archive-header")}>
        <div>
          <Link className={archiveClass("qa-archive-link")} to="/agent/archive">返回合同列表</Link>
          <h1 className={archiveClass("qa-archive-title")}>{state.title}</h1>
          <p className={archiveClass("qa-archive-subtitle")}>文档 #{state.documentId} · {state.status || "未知状态"}</p>
        </div>
        <button type="button" className="qa-btn qa-btn-primary" disabled={archiveDisabled} onClick={state.archive}>
          {state.readinessLoading ? "检查中" : archiveText}
        </button>
      </div>

      {state.error && <div className={archiveClass("qa-archive-error")}>操作失败：{state.error}</div>}
      {state.message && <div className={archiveClass("qa-archive-success")}>{state.message}</div>}
      {readiness && (
        <div className={readiness.canArchive ? archiveClass("qa-archive-success") : archiveClass("qa-archive-warning")}>
          <div className="font-semibold">
            {readiness.canArchive ? "归档检查通过" : readiness.forceRequired ? "需要确认后强制归档" : "暂不满足归档条件"}
          </div>
          <div className="mt-1 text-xs">
            items {readiness.summary.itemCount} · 字段候选 {readiness.summary.termTypeCandidateCount} · 值候选 {readiness.summary.valueCandidateCount} · 产品编号 {textValue(readiness.summary.productNumber)}
          </div>
          {(readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
              <ReadinessList title="阻断项" items={readiness.blockers} />
              <ReadinessList title="警告" items={readiness.warnings} />
            </div>
          )}
        </div>
      )}

      {state.loading ? (
        <div className={archiveClass("qa-archive-panel")}>正在加载合同详情</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={archiveClass("qa-archive-panel")}>
            <div className={archiveClass("qa-archive-panel-title")}>document 信息</div>
            <InfoRow label="文件名" value={state.document?.fileName} />
            <InfoRow label="状态" value={state.status} />
            <InfoRow label="创建时间" value={formatDateTime(state.document?.createdAt)} />
            <InfoRow label="更新时间" value={formatDateTime(state.document?.updatedAt)} />
            <JsonBlock title=" document JSON" value={state.document} />
            <div className="mt-4">
              <div className={archiveClass("qa-archive-panel-title")}>normalized document_info</div>
              <JsonBlock title=" document_info" value={state.normalizedInfo} defaultOpen />
            </div>
          </aside>

          <section className="space-y-3">
            {state.warnings.length > 0 && (
              <div className={archiveClass("qa-archive-warning")}>
                warnings {state.warnings.length} 条
                <JsonBlock title=" warnings" value={state.warnings} />
              </div>
            )}
            {state.items.map((item, index) => (
              <article key={String(item.item_index ?? index)} className={archiveClass("qa-archive-panel")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-900">Item {textValue(item.item_index ?? index + 1)}</div>
                      <MasterDataStatus item={item} />
                    </div>
                    <div className="text-xs text-slate-500">数量：{textValue(item.item_quantity)}</div>
                  </div>
                  <JsonBlock title=" item JSON" value={item} />
                </div>
                <div className={archiveClass("qa-archive-section-title")}>配置字段</div>
                <DerivedMasterDataModelRow item={item} />
                <FieldTable fields={item.fields ?? []} />
                <HiddenFieldsDisclosure fields={item.fields ?? []} />
              </article>
            ))}
            {!state.items.length && <div className={archiveClass("qa-archive-panel qa-archive-empty")}>暂无 items</div>}
          </section>
        </div>
      )}
    </div>
  );
}

function HiddenFieldsDisclosure({ fields }: { fields: Array<ArchiveItemField | QuoteAgentField> }) {
  const unmatchedFields = fields.filter(isUnmatchedConfigField);
  const traceFields = fields.filter((field) => !isMainConfigField(field) && !isUnmatchedConfigField(field));
  if (!unmatchedFields.length && !traceFields.length) return null;

  return (
    <div className="mt-3 space-y-3">
      {unmatchedFields.length > 0 && (
        <div>
          <div className={archiveClass("qa-archive-section-title")}>未匹配字段</div>
          <FieldTable fields={unmatchedFields} mode="hidden" />
        </div>
      )}
      {traceFields.length > 0 && (
        <details className="rounded border border-slate-200 bg-slate-50/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            原始字段 / evidence（{traceFields.length}）
          </summary>
          <div className="mt-3">
            <FieldTable fields={traceFields} mode="hidden" />
          </div>
        </details>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-800">{textValue(value)}</span>
    </div>
  );
}

function ReadinessList({ title, items }: { title: string; items: Array<{ type: string; message: string }> }) {
  return (
    <div>
      <div className="font-medium text-slate-700">{title} {items.length}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {items.map((item, index) => (
            <li key={`${item.type}-${index}`}>{item.message || item.type}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-slate-500">无</div>
      )}
    </div>
  );
}
