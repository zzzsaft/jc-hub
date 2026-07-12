import type { FrozenEvidence, ItemRole, PackageAnnotation, PackageItem } from "../types";

const roles: Array<[ItemRole, string]> = [["peer_product", "平级产品"], ["component", "组件"], ["accessory", "附件"], ["spare_part", "备件"], ["sales_kit", "销售套件"], ["manufacturing_intermediate", "制造中间件"], ["unknown", "不确定"]];
const newItem = (): PackageItem => ({ gold_item_id: crypto.randomUUID(), matched_prediction_item_id: null, item_name: "", product_family: null, product_subtype: null, item_role: "peer_product", model: null, peer_group_id: null, related_to_gold_item_id: null, evidence_refs: [] });

export function PackageItemsForm({ value, evidence, onChange }: { value: PackageAnnotation; evidence: FrozenEvidence[]; onChange(value: PackageAnnotation): void }) {
  const update = (index: number, item: PackageItem) => onChange({ ...value, items: value.items.map((current, itemIndex) => itemIndex === index ? item : current) });
  return <fieldset><legend>产品包</legend>
    <label>证据充分性<select value={value.evidence_sufficiency} onChange={(event) => onChange({ ...value, evidence_sufficiency: event.target.value as PackageAnnotation["evidence_sufficiency"] })}><option value="sufficient">可以判断</option><option value="insufficient_evidence">证据不足</option><option value="legitimate_ambiguity">存在合理歧义</option><option value="abstain">无法判断</option></select></label>
    {value.items.map((item, index) => <article className="full-review-item" key={item.gold_item_id}><div className="full-review-item-title"><h3>产品项 {index + 1}</h3><button type="button" className="full-review-danger" onClick={() => onChange({ ...value, items: value.items.filter((_, itemIndex) => itemIndex !== index) })}>移除</button></div><div className="full-review-form-grid">
      <label>产品名称<input value={item.item_name} onChange={(event) => update(index, { ...item, item_name: event.target.value })} /></label><label>型号<input value={item.model ?? ""} onChange={(event) => update(index, { ...item, model: event.target.value || null })} /></label>
      <label>产品族<input value={item.product_family ?? ""} onChange={(event) => update(index, { ...item, product_family: event.target.value || null })} /></label><label>产品子类<input value={item.product_subtype ?? ""} onChange={(event) => update(index, { ...item, product_subtype: event.target.value || null })} /></label>
      <label>角色<select value={item.item_role} onChange={(event) => update(index, { ...item, item_role: event.target.value as ItemRole })}>{roles.map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label><label>平级组<input value={item.peer_group_id ?? ""} onChange={(event) => update(index, { ...item, peer_group_id: event.target.value || null })} /></label>
      <label>关联产品<select value={item.related_to_gold_item_id ?? ""} onChange={(event) => update(index, { ...item, related_to_gold_item_id: event.target.value || null })}><option value="">无 / 不确定</option>{value.items.filter((other) => other.gold_item_id !== item.gold_item_id).map((other) => <option value={other.gold_item_id} key={other.gold_item_id}>{other.item_name || other.gold_item_id}</option>)}</select></label><label>证据<select multiple value={item.evidence_refs} onChange={(event) => update(index, { ...item, evidence_refs: Array.from(event.target.selectedOptions, (option) => option.value) })}>{evidence.map((entry) => <option value={entry.evidence_id} key={entry.evidence_id}>{entry.evidence_id}</option>)}</select></label>
    </div></article>)}
    <button type="button" className="full-review-add" onClick={() => onChange({ ...value, items: [...value.items, newItem()] })}>＋ 添加产品项</button>
    <label>产品包备注<textarea value={value.notes ?? ""} onChange={(event) => onChange({ ...value, notes: event.target.value || null })} /></label>
  </fieldset>;
}
