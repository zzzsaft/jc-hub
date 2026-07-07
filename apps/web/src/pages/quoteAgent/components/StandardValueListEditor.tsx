export type StandardValueListItem = {
  id: string;
  canonicalValue: string;
  displayName: string;
  aliasNamesText: string;
};

type Props = {
  values: StandardValueListItem[];
  onChange: (values: StandardValueListItem[]) => void;
};

const inputClass =
  "box-border h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500";

const createItem = (): StandardValueListItem => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  canonicalValue: "",
  displayName: "",
  aliasNamesText: "",
});

export function StandardValueListEditor({ values, onChange }: Props) {
  const rows = values.length ? values : [createItem()];

  const updateRow = (id: string, patch: Partial<StandardValueListItem>) => {
    onChange(rows.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addRow = () => onChange([...rows, createItem()]);
  const removeRow = (id: string) => {
    const nextRows = rows.filter((item) => item.id !== id);
    onChange(nextRows.length ? nextRows : [createItem()]);
  };

  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">标准值列表</div>
        <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={addRow}>
          新增一行
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 gap-2 border border-slate-200 bg-slate-50 p-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">标准值</span>
              <input
                className={inputClass}
                value={item.canonicalValue}
                placeholder={`标准值 ${index + 1}`}
                onChange={(event) => updateRow(item.id, { canonicalValue: event.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">显示名</span>
              <input
                className={inputClass}
                value={item.displayName}
                placeholder="默认同标准值"
                onChange={(event) => updateRow(item.id, { displayName: event.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">Alias</span>
              <input
                className={inputClass}
                value={item.aliasNamesText}
                placeholder="多个 alias 用逗号或换行分隔"
                onChange={(event) => updateRow(item.id, { aliasNamesText: event.target.value })}
              />
            </label>
            <div className="flex items-end justify-end">
              <button
                className="qa-btn qa-btn-quiet qa-btn-sm"
                type="button"
                disabled={rows.length === 1}
                onClick={() => removeRow(item.id)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
