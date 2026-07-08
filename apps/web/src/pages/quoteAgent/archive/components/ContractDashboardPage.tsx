import { useNavigate } from "react-router-dom";
import { ArchiveDetailPage } from "./ArchiveDetailPage";
import { useContractDashboardState } from "../hooks/useContractDashboardState";
import { formatDateTime, textValue } from "../../utils";
import type { ContractArchiveStatus } from "../../types";
import { archiveClass } from "../classNames";

const statuses: Array<{ value: ContractArchiveStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "uploaded", label: "已上传" },
  { value: "normalized", label: "已归一化" },
  { value: "archived", label: "已归档" },
];

export function ContractDashboardPage() {
  const state = useContractDashboardState();
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));

  return (
    <div className={archiveClass("qa-archive-page")}>
      <div className={archiveClass("qa-archive-header")}>
        <div>
          <h1 className={archiveClass("qa-archive-title")}>合同归档工作台</h1>
          <p className={archiveClass("qa-archive-subtitle")}>查看上传、归一化、归档合同，并进入归档编辑。</p>
        </div>
        <button type="button" className="qa-btn qa-btn-secondary" onClick={() => navigate("/agent/archive/product-configs")}>产品配置查询</button>
      </div>

      <div className={archiveClass("qa-archive-stats")}>
        <StatCard label="已上传" value={state.summary.uploadedCount} />
        <StatCard label="已归一化" value={state.summary.normalizedCount} />
        <StatCard label="已归档" value={state.summary.archivedCount} />
      </div>

      <section className={archiveClass("qa-archive-panel")}>
        <div className={archiveClass("qa-archive-toolbar")}>
          <input className={archiveClass("qa-archive-input")} placeholder="搜索文件名 / 合同" value={state.q} onChange={(event) => state.setQ(event.target.value)} onKeyDown={(event) => event.key === "Enter" && state.search()} />
          <select className={archiveClass("qa-archive-input")} value={state.status} onChange={(event) => { state.setStatus(event.target.value as ContractArchiveStatus | ""); state.setPage(1); }}>
            {statuses.map((status) => <option key={status.value || "all"} value={status.value}>{status.label}</option>)}
          </select>
          <input className={archiveClass("qa-archive-input")} placeholder="产品编号" value={state.productNumber} onChange={(event) => state.setProductNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && state.search()} />
          <input className={archiveClass("qa-archive-input")} placeholder="客户编号" value={state.customerId} onChange={(event) => state.setCustomerId(event.target.value)} onKeyDown={(event) => event.key === "Enter" && state.search()} />
          <button type="button" className="qa-btn qa-btn-primary" disabled={state.loading} onClick={state.search}>{state.loading ? "查询中" : "查询"}</button>
        </div>

        {state.error && <div className={archiveClass("qa-archive-error")}>加载失败：{state.error}</div>}

        <div className="overflow-auto rounded border border-slate-200">
          <table className="min-w-[1120px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-64 px-3 py-2 text-left font-medium text-slate-600">文件名</th>
                <th className="w-28 px-3 py-2 text-left font-medium text-slate-600">状态</th>
                <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">产品编号</th>
                <th className="w-36 px-3 py-2 text-left font-medium text-slate-600">合同编号</th>
                <th className="w-36 px-3 py-2 text-left font-medium text-slate-600">订单编号</th>
                <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">客户编号</th>
                <th className="w-24 px-3 py-2 text-left font-medium text-slate-600">当前版本</th>
                <th className="w-40 px-3 py-2 text-left font-medium text-slate-600">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {state.contracts.map((contract) => (
                <tr key={`${contract.documentId}-${contract.archiveId ?? "document"}`} className="cursor-pointer hover:bg-blue-50/60" onClick={() => state.openContract(contract)}>
                  <td className="px-3 py-2 font-medium text-slate-800">{textValue(contract.fileName)}</td>
                  <td className="px-3 py-2"><span className={archiveClass("qa-archive-badge")}>{contract.status}</span></td>
                  <td className="px-3 py-2">{textValue(contract.productNumber)}</td>
                  <td className="px-3 py-2">{textValue(contract.contractNumber)}</td>
                  <td className="px-3 py-2">{textValue(contract.orderNumber)}</td>
                  <td className="px-3 py-2">{textValue(contract.customerId)}</td>
                  <td className="px-3 py-2">{contract.currentVersion ? `v${contract.currentVersion}` : "-"}</td>
                  <td className="px-3 py-2">{formatDateTime(contract.updatedAt || contract.createdAt)}</td>
                </tr>
              ))}
              {!state.contracts.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">{state.loading ? "正在加载" : "暂无合同"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>共 {state.total} 条</span>
          <div className="flex items-center gap-2">
            <button type="button" className="qa-btn qa-btn-secondary qa-btn-sm" disabled={state.page <= 1 || state.loading} onClick={() => state.setPage(Math.max(1, state.page - 1))}>上一页</button>
            <span>{state.page} / {totalPages}</span>
            <button type="button" className="qa-btn qa-btn-secondary qa-btn-sm" disabled={state.page >= totalPages || state.loading} onClick={() => state.setPage(state.page + 1)}>下一页</button>
          </div>
        </div>
      </section>
      {state.selectedArchiveId && (
        <div className={archiveClass("qa-archive-modal-backdrop")}>
          <ArchiveDetailPage archiveId={state.selectedArchiveId} modal onClose={state.closeArchiveModal} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={archiveClass("qa-archive-stat")}>
      <div className={archiveClass("qa-archive-stat-value")}>{value}</div>
      <div className={archiveClass("qa-archive-stat-label")}>{label}</div>
    </div>
  );
}
