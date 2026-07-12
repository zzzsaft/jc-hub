import type { ConfigurationField, FrozenEvidence, PackageItem } from "../types";
import { addConfigurationField, removeConfigurationField } from "../utils";

type Props = {
  value: ConfigurationField[];
  items: PackageItem[];
  evidence: FrozenEvidence[];
  onChange(value: ConfigurationField[]): void;
};

export function ConfigFieldsForm({ value, items, evidence, onChange }: Props) {
  const update = (index: number, field: ConfigurationField) => onChange(value.map((item, itemIndex) => itemIndex === index ? field : item));
  return <fieldset>
    <legend>关键配置</legend>
    {value.length === 0 && <p className="full-review-help">本任务没有预置配置字段，可按证据添加。</p>}
    {value.map((field, index) => <article className="full-review-item" key={index}>
      <div className="full-review-form-grid">
        <label>字段名<input value={field.field_key} onChange={(event) => update(index, { ...field, field_key: event.target.value })} /></label>
        <label>所属产品<select value={field.item_id ?? ""} onChange={(event) => update(index, { ...field, item_id: event.target.value || null })}><option value="">文档级 / 未指定</option>{items.map((item) => <option key={item.gold_item_id} value={item.gold_item_id}>{item.item_name || item.gold_item_id}</option>)}</select></label>
        <label>值<input value={field.value ?? ""} onChange={(event) => update(index, { ...field, value: event.target.value || null })} /></label>
        <label>单位<input value={field.unit ?? ""} onChange={(event) => update(index, { ...field, unit: event.target.value || null })} /></label>
        <label>选项<input value={field.option ?? ""} onChange={(event) => update(index, { ...field, option: event.target.value || null })} /></label>
        <label>证据<select multiple value={field.evidence_refs} onChange={(event) => update(index, { ...field, evidence_refs: Array.from(event.target.selectedOptions, (option) => option.value) })}>{evidence.map((entry) => <option key={entry.evidence_id} value={entry.evidence_id}>{entry.evidence_id}</option>)}</select></label>
      </div>
      <button type="button" className="full-review-danger" onClick={() => onChange(removeConfigurationField(value, index))}>移除配置字段</button>
    </article>)}
    <button type="button" className="full-review-add" onClick={() => onChange(addConfigurationField(value))}>＋ 添加配置字段</button>
  </fieldset>;
}
