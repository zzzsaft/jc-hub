import { useState } from "react";
import { DictionaryEditorModal } from "./components/DictionaryEditorModal";
import { DictionaryToolbar } from "./components/DictionaryToolbar";
import { TermTypeTable } from "./components/TermTypeTable";
import { UnitAliasManagerPanel } from "./components/UnitAliasManagerPanel";
import { useDictionaryManagerState } from "./hooks/useDictionaryManagerState";
import "../quoteAgent/styles.css";

type Props = {
  embedded?: boolean;
};

type DictionaryTab = "terms" | "units";

export function QuoteAgentDictionaryManager({ embedded = false }: Props) {
  const state = useDictionaryManagerState();
  const [activeTab, setActiveTab] = useState<DictionaryTab>("terms");

  return (
    <div className={embedded ? "min-h-0 bg-white text-slate-900" : "min-h-full bg-white text-slate-900"}>
      <div className={embedded ? "bg-white" : "border border-slate-200 bg-white shadow-sm"}>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {!embedded && <h1 className="text-lg font-semibold text-slate-950">字典管理</h1>}
              <p className={embedded ? "text-sm text-slate-500" : "mt-1 text-sm text-slate-500"}>
                查看和编辑 termType、term alias、字段值 alias 及适用属性。
              </p>
            </div>
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                TermType {state.termTypes.length}
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                Value {state.values.length}
              </span>
            </div>
          </div>
        </div>

        <div className="qa-review-tabs" role="tablist" aria-label="字典管理类型">
          <div className="qa-review-tabs-track">
            {[
              ["terms", "字段 / 值字典"],
              ["units", "单位管理"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className="qa-review-tab"
                onClick={() => setActiveTab(tab as DictionaryTab)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "terms" ? (
          <>
            <DictionaryToolbar
              keyword={state.keyword}
              loading={state.loading}
              onKeywordChange={state.setKeyword}
              onReload={() => state.reload({ force: true })}
              onCreateTermType={state.openCreateTermType}
            />

            {(state.message || state.error) && (
              <div className="space-y-1 border-b border-slate-200 px-4 py-2 text-sm">
                {state.message && <div className="text-emerald-700">{state.message}</div>}
                {state.error && <div className="text-rose-700">操作失败：{state.error}</div>}
              </div>
            )}

            <div className="p-3">
              <TermTypeTable
                loading={state.loading}
                rows={state.filteredTermTypes}
                values={state.values}
                productTypes={state.productTypes}
                onEdit={state.openEditTermType}
                onCreateValue={state.openCreateValue}
                onEditValue={state.openEditValue}
                onUpdateTermType={state.updateDictionaryTermTypeField}
                onUpdateValue={state.updateDictionaryValueField}
                onDeleteValue={state.deleteDictionaryValue}
              />
            </div>
          </>
        ) : (
          <UnitAliasManagerPanel />
        )}
      </div>

      {state.editor && (
        <DictionaryEditorModal
          editor={state.editor}
          saving={state.saving}
          termTypes={state.termTypes}
          productTypes={state.productTypes}
          onChange={state.updateEditorValues}
          onSubmit={state.submitEditor}
          onClose={state.closeEditor}
        />
      )}
    </div>
  );
}

export default function QuoteAgentDictionaryPage() {
  return <QuoteAgentDictionaryManager />;
}
