import { Link } from "react-router-dom";
import { useProductConfigSearchState } from "../hooks/useProductConfigSearchState";
import { JsonBlock } from "./JsonBlock";
import { textValue } from "../../utils";
import { archiveClass } from "../classNames";

export function ProductConfigSearchPage() {
  const state = useProductConfigSearchState();
  const matches = state.result?.matches ?? [];

  return (
    <div className={archiveClass("qa-archive-page")}>
      <div className={archiveClass("qa-archive-header")}>
        <div>
          <Link className={archiveClass("qa-archive-link")} to="/agent/archive">返回合同列表</Link>
          <h1 className={archiveClass("qa-archive-title")}>产品配置查询</h1>
          <p className={archiveClass("qa-archive-subtitle")}>按产品编号搜索归档配置和价格信息。</p>
        </div>
      </div>

      <section className={archiveClass("qa-archive-panel")}>
        <div className={archiveClass("qa-archive-toolbar")}>
          <input className={archiveClass("qa-archive-input")} placeholder="产品编号，必填，支持模糊搜索" value={state.productNumber} onChange={(event) => state.setProductNumber(event.target.value)} onKeyDown={(event) => event.key === "Enter" && state.search()} />
          <input className={archiveClass("qa-archive-input")} placeholder="客户编号，可选，精准过滤" value={state.customerId} onChange={(event) => state.setCustomerId(event.target.value)} onKeyDown={(event) => event.key === "Enter" && state.search()} />
          <button type="button" className="qa-btn qa-btn-primary" disabled={state.loading} onClick={state.search}>{state.loading ? "查询中" : "查询"}</button>
        </div>
        {state.error && <div className={archiveClass("qa-archive-error")}>查询失败：{state.error}</div>}
      </section>

      <section className={archiveClass("qa-archive-panel")}>
        <div className="mb-3 flex items-center justify-between">
          <div className={archiveClass("qa-archive-panel-title")}>查询结果</div>
          <div className="text-sm text-slate-500">共 {matches.length} 条</div>
        </div>
        <div className="overflow-auto rounded border border-slate-200">
          <table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">产品编号</th>
                <th className="w-28 px-3 py-2 text-left font-medium text-slate-600">匹配状态</th>
                <th className="w-64 px-3 py-2 text-left font-medium text-slate-600">archive 来源</th>
                <th className="w-52 px-3 py-2 text-left font-medium text-slate-600">item</th>
                <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">item 类型</th>
                <th className="w-44 px-3 py-2 text-left font-medium text-slate-600">ERP 信息</th>
                <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">价格</th>
                <th className="w-40 px-3 py-2 text-left font-medium text-slate-600">配置字段</th>
                <th className="w-40 px-3 py-2 text-left font-medium text-slate-600">productBinding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {matches.map((match) => (
                <tr key={`${match.archiveId}-${match.itemId}-${match.productBinding?.id ?? match.itemIndex}`}>
                  <td className="px-3 py-2 font-medium text-slate-800">{textValue(match.productBinding?.productNumber)}</td>
                  <td className="px-3 py-2">
                    <span className={match.matchStatus === "archive_only" ? archiveClass("qa-archive-badge-warn") : archiveClass("qa-archive-badge")}>
                      {match.matchStatus === "archive_only" ? "仅归档配置" : textValue(match.matchStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{textValue(match.fileName)}</div>
                    <div className="text-xs text-slate-500">archive #{match.archiveId} · document #{match.documentId}</div>
                    <div className="text-xs text-slate-500">客户编号：{textValue(match.customerId)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{textValue(match.itemName)}</div>
                    <div className="text-xs text-slate-500">item #{match.itemIndex}</div>
                  </td>
                  <td className="px-3 py-2">{textValue(match.itemProductTypeHint)}</td>
                  <td className="px-3 py-2">
                    {match.erpProduct ? (
                      <div className="space-y-1 text-xs">
                        <div>ID：{textValue(match.erpProduct.id)}</div>
                        <div>父级：{textValue(match.erpProduct.parentProductNumber)}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">暂无 ERP 匹配</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{match.price ? `${textValue(match.price.amount)} ${textValue(match.price.currency, "")}` : "-"}</td>
                  <td className="px-3 py-2"><JsonBlock title=" 配置字段" value={match.configFields ?? []} /></td>
                  <td className="px-3 py-2"><JsonBlock title=" binding" value={match.productBinding ?? null} /></td>
                </tr>
              ))}
              {!matches.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">{state.loading ? "正在查询" : "暂无结果"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
