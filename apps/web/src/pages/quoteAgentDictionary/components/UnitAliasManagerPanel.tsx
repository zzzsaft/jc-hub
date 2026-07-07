import { useState } from "react";
import { Button, Input } from "@/components/ui/core";
import type { UnitAlias, UnitAliasPayload } from "../../quoteAgent/types";
import { useUnitAliasManagerState } from "../hooks/useUnitAliasManagerState";

type Draft = UnitAliasPayload & { id?: string | number };

const emptyDraft: Draft = {
  canonicalUnit: "",
  aliasValue: "",
  displayUnit: "",
  reviewedBy: "Codex",
};

const text = (value: unknown) => String(value ?? "").trim();

export function UnitAliasManagerPanel() {
  const state = useUnitAliasManagerState();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const groupEntries = Object.entries(state.aliasGroups).sort(([left], [right]) => left.localeCompare(right));

  const update = (field: keyof UnitAliasPayload, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const editAlias = (alias: UnitAlias) => {
    setDraft({
      id: alias.id,
      canonicalUnit: text(alias.canonicalUnit),
      aliasValue: text(alias.aliasValue),
      displayUnit: text(alias.displayUnit || alias.canonicalUnit),
      reviewedBy: "Codex",
    });
  };

  const submit = async () => {
    await state.saveAlias(
      {
        canonicalUnit: draft.canonicalUnit,
        aliasValue: draft.aliasValue,
        displayUnit: draft.displayUnit || draft.canonicalUnit,
        reviewedBy: "Codex",
      },
      draft.id,
    );
    setDraft(emptyDraft);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="border border-slate-200 bg-slate-50 p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto]">
          <Input
            value={state.keyword}
            placeholder="搜索 canonicalUnit、displayUnit、aliasValue"
            onChange={(event) => state.setKeyword(event.target.value)}
          />
          <Button loading={state.loading} onClick={() => state.load({ force: true })}>刷新</Button>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded border border-slate-200 bg-white px-2 py-1">Alias {state.aliases.length}</span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1">分组 {groupEntries.length}</span>
          </div>
        </div>
      </div>

      {(state.message || state.error) && (
        <div className="space-y-1 border border-slate-200 bg-white px-3 py-2 text-sm">
          {state.message && <div className="text-emerald-700">{state.message}</div>}
          {state.error && <div className="text-rose-700">操作失败：{state.error}</div>}
        </div>
      )}

      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-950">单位 Alias 维护</h2>
        </div>
        <div className="border-b border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <Input value={draft.canonicalUnit} placeholder="canonicalUnit，例如 kg/h" onChange={(event) => update("canonicalUnit", event.target.value)} />
            <Input value={draft.aliasValue} placeholder="aliasValue，例如 公斤/H" onChange={(event) => update("aliasValue", event.target.value)} />
            <Input value={draft.displayUnit} placeholder="displayUnit，可留空" onChange={(event) => update("displayUnit", event.target.value)} />
            <Button disabled={!!state.savingId || !draft.canonicalUnit || !draft.aliasValue} onClick={submit}>
              {state.savingId === (draft.id ?? "new") ? "保存中" : draft.id ? "更新" : "新增"}
            </Button>
            <Button type="text" disabled={!!state.savingId} onClick={() => setDraft(emptyDraft)}>
              清空
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          {state.loading ? (
            <div className="px-3 py-10 text-center text-sm text-slate-500">正在加载单位 Alias</div>
          ) : groupEntries.length ? (
            groupEntries.map(([canonicalUnit, aliases]) => (
              <div key={canonicalUnit} className="border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0 break-words text-sm font-semibold text-slate-900">{canonicalUnit}</div>
                  <span className="shrink-0 text-xs text-slate-500">{aliases.length} 个别名</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {aliases.map((alias, index) => (
                    <div key={String(alias.id ?? `${canonicalUnit}-${index}`)} className="grid grid-cols-1 gap-2 px-3 py-2 text-sm md:grid-cols-[1fr_1fr_1fr_auto]">
                      <div className="min-w-0 break-words">
                        <span className="text-slate-500">aliasValue: </span>
                        <span className="font-medium text-slate-900">{text(alias.aliasValue) || "-"}</span>
                      </div>
                      <div className="min-w-0 break-words">
                        <span className="text-slate-500">displayUnit: </span>
                        <span className="font-medium text-slate-900">{text(alias.displayUnit) || "-"}</span>
                      </div>
                      <div className="min-w-0 break-words text-slate-500">
                        normalized: {text(alias.normalizedAlias) || "-"}
                      </div>
                      <Button type="text" disabled={!alias.id} onClick={() => editAlias(alias)}>
                        编辑
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-10 text-center text-sm text-slate-500">
              {state.keyword ? "没有匹配的单位 Alias。" : "暂无单位 Alias。"}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
