import { useEffect, useState } from "react";
import type { ArchiveItem, ProductBinding } from "../../types";
import { textValue } from "../../utils";
import { archiveClass } from "../classNames";

type Props = {
  item: ArchiveItem;
  saving?: boolean;
  onSave: (item: ArchiveItem, bindings: ProductBinding[]) => void;
};

const roles = ["primary", "component", "spare_part", "derived", "unknown"];
const sources = ["document", "erp", "manual", "rule", "inherited"];
const matchStatuses = ["unmatched", "matched", "ambiguous", "manual"];

const emptyBinding = (): ProductBinding => ({
  productNumber: "",
  role: "unknown",
  quantity: null,
  bindingSource: "manual",
  confidence: null,
  erpProductId: null,
  erpParentProductNumber: null,
  erpMatchStatus: "manual",
  price: { amount: null, currency: null, source: "manual" },
  note: null,
});

export function ProductBindingsEditor({ item, saving = false, onSave }: Props) {
  const [bindings, setBindings] = useState<ProductBinding[]>(item.productBindings?.length ? item.productBindings : []);

  useEffect(() => {
    setBindings(item.productBindings?.length ? item.productBindings : []);
  }, [item.id, item.productBindings]);

  const updateBinding = (index: number, patch: Partial<ProductBinding>) => {
    setBindings((current) => current.map((binding, rowIndex) => rowIndex === index ? { ...binding, ...patch } : binding));
  };

  const updatePrice = (index: number, patch: NonNullable<ProductBinding["price"]>) => {
    setBindings((current) =>
      current.map((binding, rowIndex) =>
        rowIndex === index
          ? { ...binding, price: { ...(binding.price ?? {}), ...patch } }
          : binding,
      ),
    );
  };

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-36 px-3 py-2 text-left font-medium text-slate-600">产品编号</th>
              <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">角色</th>
              <th className="w-24 px-3 py-2 text-left font-medium text-slate-600">数量</th>
              <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">来源</th>
              <th className="w-36 px-3 py-2 text-left font-medium text-slate-600">ERP 产品 ID</th>
              <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">ERP 状态</th>
              <th className="w-24 px-3 py-2 text-left font-medium text-slate-600">价格</th>
              <th className="w-24 px-3 py-2 text-left font-medium text-slate-600">币种</th>
              <th className="w-56 px-3 py-2 text-left font-medium text-slate-600">备注</th>
              <th className="w-20 px-3 py-2 text-left font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {bindings.map((binding, index) => (
              <tr key={String(binding.id ?? index)}>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={binding.productNumber} onChange={(event) => updateBinding(index, { productNumber: event.target.value })} /></td>
                <td className="px-3 py-2">
                  <select className={archiveClass("qa-archive-input")} value={binding.role ?? "unknown"} onChange={(event) => updateBinding(index, { role: event.target.value as ProductBinding["role"] })}>
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={textValue(binding.quantity, "")} onChange={(event) => updateBinding(index, { quantity: event.target.value || null })} /></td>
                <td className="px-3 py-2">
                  <select className={archiveClass("qa-archive-input")} value={binding.bindingSource ?? "manual"} onChange={(event) => updateBinding(index, { bindingSource: event.target.value as ProductBinding["bindingSource"] })}>
                    {sources.map((source) => <option key={source} value={source}>{source}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={textValue(binding.erpProductId, "")} onChange={(event) => updateBinding(index, { erpProductId: event.target.value || null })} /></td>
                <td className="px-3 py-2">
                  <select className={archiveClass("qa-archive-input")} value={binding.erpMatchStatus ?? "manual"} onChange={(event) => updateBinding(index, { erpMatchStatus: event.target.value as ProductBinding["erpMatchStatus"] })}>
                    {matchStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={textValue(binding.price?.amount, "")} onChange={(event) => updatePrice(index, { amount: event.target.value || null })} /></td>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={textValue(binding.price?.currency, "")} onChange={(event) => updatePrice(index, { currency: event.target.value || null })} /></td>
                <td className="px-3 py-2"><input className={archiveClass("qa-archive-input")} value={textValue(binding.note, "")} onChange={(event) => updateBinding(index, { note: event.target.value || null })} /></td>
                <td className="px-3 py-2">
                  <button type="button" className="qa-btn qa-btn-quiet qa-btn-sm" onClick={() => setBindings((current) => current.filter((_, rowIndex) => rowIndex !== index))}>删除</button>
                </td>
              </tr>
            ))}
            {!bindings.length && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={10}>暂无产品编号绑定</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className="qa-btn qa-btn-secondary qa-btn-sm" onClick={() => setBindings((current) => [...current, emptyBinding()])}>新增绑定</button>
        <button type="button" className="qa-btn qa-btn-primary qa-btn-sm" disabled={saving} onClick={() => onSave(item, bindings)}>{saving ? "保存中" : "保存产品编号绑定"}</button>
      </div>
    </div>
  );
}
