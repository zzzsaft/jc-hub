import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { Button, Input, Tag } from "@/components/ui/core";
import { EditOutlined } from "@/components/ui/icons";
import type { DictionaryValue } from "../../quoteAgent/types";
import { textList } from "../utils";
import { AliasTagInput } from "./AliasTagInput";
import type { EditingValueCell, ValueColumnWidthMap, ValueField } from "./dictionaryDetailModal.utils";
import { joinTextList, rowKeyOf, valueAliases } from "./dictionaryDetailModal.utils";

type Props = {
  values: DictionaryValue[];
  canDeleteValues: boolean;
  savingKey: string;
  editingValueCell: EditingValueCell | null;
  valueColumnWidths: ValueColumnWidthMap;
  onCreateValue?: () => void;
  onUpdateValue?: (value: DictionaryValue, patch: Partial<DictionaryValue>) => Promise<void>;
  onDeleteValue?: (value: DictionaryValue) => Promise<void>;
  onEditChange: Dispatch<SetStateAction<EditingValueCell | null>>;
  onSavingKeyChange: (value: string) => void;
  onColumnWidthsChange: Dispatch<SetStateAction<ValueColumnWidthMap>>;
};

function AliasTags({ aliases }: { aliases: string[] }) {
  if (!aliases.length) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {aliases.map((alias) => (
        <Tag key={alias} className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
          {alias}
        </Tag>
      ))}
    </div>
  );
}

export function DictionaryDetailValueTable({
  values,
  canDeleteValues,
  savingKey,
  editingValueCell,
  valueColumnWidths,
  onCreateValue,
  onUpdateValue,
  onDeleteValue,
  onEditChange,
  onSavingKeyChange,
  onColumnWidthsChange,
}: Props) {
  const valueTableWidth =
    valueColumnWidths.canonicalValue +
    valueColumnWidths.displayName +
    valueColumnWidths.aliasNames +
    (canDeleteValues ? 110 : 0);

  const startValueColumnResize = (field: ValueField, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = valueColumnWidths[field];

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(120, startWidth + moveEvent.clientX - startX);
      onColumnWidthsChange((current) => ({ ...current, [field]: nextWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const iconButton = (label: string, onClick: (event: MouseEvent<HTMLButtonElement>) => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="ml-2 inline-flex h-6 w-6 shrink-0 appearance-none items-center justify-center rounded border-0 bg-transparent p-0 text-xs text-slate-400 shadow-none transition hover:bg-slate-100 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
      onClick={onClick}
    >
      <EditOutlined />
    </button>
  );

  const startValueEdit = (value: DictionaryValue, field: ValueField) => {
    const draft = field === "aliasNames" ? joinTextList(valueAliases(value)) : String(value[field] ?? "");
    onEditChange({ rowKey: rowKeyOf(value), field, draft });
  };

  const saveValueEdit = async (value: DictionaryValue) => {
    if (!editingValueCell || !onUpdateValue) return;
    const current =
      editingValueCell.field === "aliasNames"
        ? joinTextList(valueAliases(value))
        : String(value[editingValueCell.field] ?? "");

    if (editingValueCell.draft.trim() === current.trim()) {
      onEditChange(null);
      return;
    }

    const patch =
      editingValueCell.field === "aliasNames"
        ? { aliasNames: textList(editingValueCell.draft, [value.canonicalValue]) }
        : { [editingValueCell.field]: editingValueCell.draft.trim() };
    const cellKey = `${rowKeyOf(value)}:${editingValueCell.field}`;
    onSavingKeyChange(cellKey);
    try {
      await onUpdateValue(value, patch);
      onEditChange(null);
    } finally {
      onSavingKeyChange("");
    }
  };

  const deleteValue = async (value: DictionaryValue) => {
    if (!onDeleteValue) return;
    const label = [value.displayName, value.canonicalValue].filter(Boolean).join(" / ") || "该标准值";
    if (!window.confirm(`确认删除标准值「${label}」？删除后不可在前端恢复。`)) return;

    onSavingKeyChange(`delete:${rowKeyOf(value)}`);
    try {
      await onDeleteValue(value);
      if (editingValueCell?.rowKey === rowKeyOf(value)) onEditChange(null);
    } finally {
      onSavingKeyChange("");
    }
  };

  const editableValueCell = (value: DictionaryValue, field: ValueField, text: string) => {
    const rowKey = rowKeyOf(value);
    const isEditing = editingValueCell?.rowKey === rowKey && editingValueCell.field === field;
    const isSaving = savingKey === `${rowKey}:${field}`;

    if (isEditing && field === "aliasNames") {
      return (
        <div className="min-h-10 space-y-2">
          <AliasTagInput
            value={editingValueCell.draft}
            placeholder="添加 alias"
            onChange={(nextValue) =>
              onEditChange((current) => (current ? { ...current, draft: nextValue } : current))
            }
          />
          <div className="flex justify-end gap-1.5">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => onEditChange(null)}>
              取消
            </Button>
            <Button
              type="primary"
              className="min-h-7 px-2 py-1 text-xs"
              loading={isSaving}
              onClick={() => void saveValueEdit(value)}
            >
              保存
            </Button>
          </div>
        </div>
      );
    }

    if (isEditing) {
      return (
        <Input
          autoFocus
          disabled={isSaving}
          className="h-8 text-sm"
          value={editingValueCell.draft}
          onChange={(event: any) =>
            onEditChange((current) => (current ? { ...current, draft: event.target.value } : current))
          }
          onBlur={() => void saveValueEdit(value)}
          onClick={(event: any) => event.stopPropagation()}
          onKeyDown={(event: any) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onEditChange(null);
            }
          }}
        />
      );
    }

    return (
      <div className="flex min-h-8 items-start justify-between gap-2">
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {field === "aliasNames" ? <AliasTags aliases={valueAliases(value)} /> : text || "-"}
        </span>
        {onUpdateValue &&
          iconButton("编辑单元格", (event) => {
            event.stopPropagation();
            startValueEdit(value, field);
          })}
      </div>
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-medium text-slate-700">该 TermType 下的标准值</div>
        {onCreateValue && (
          <Button className="min-h-7 px-2 py-1 text-xs" onClick={onCreateValue}>
            新增标准值
          </Button>
        )}
      </div>
      <div className="max-h-72 overflow-auto rounded border border-slate-200">
        <table
          className="table-fixed divide-y divide-slate-100 text-sm"
          style={{ width: valueTableWidth, minWidth: valueTableWidth }}
        >
          <colgroup>
            <col style={{ width: valueColumnWidths.canonicalValue }} />
            <col style={{ width: valueColumnWidths.displayName }} />
            <col style={{ width: valueColumnWidths.aliasNames }} />
            {canDeleteValues && <col style={{ width: 110 }} />}
          </colgroup>
          <thead className="bg-slate-50">
            <tr>
              {[
                ["canonicalValue", "标准值", "调整标准值列宽"],
                ["displayName", "显示名", "调整显示名列宽"],
                ["aliasNames", "Alias", "调整 Alias 列宽"],
              ].map(([field, label, ariaLabel], index) => (
                <th
                  key={field}
                  className={[
                    "relative px-3 py-2 text-left font-medium text-slate-600",
                    index < 2 ? "border-r border-slate-200" : "",
                  ].join(" ")}
                  style={{ width: valueColumnWidths[field as ValueField] }}
                >
                  {label}
                  <button
                    type="button"
                    aria-label={ariaLabel}
                    className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-col-resize touch-none appearance-none border-0 border-r border-transparent bg-transparent p-0 outline-none transition hover:border-brand-400 hover:bg-brand-50/80"
                    onMouseDown={(event) => startValueColumnResize(field as ValueField, event)}
                  />
                </th>
              ))}
              {canDeleteValues && (
                <th className="px-3 py-2 text-left font-medium text-slate-600" style={{ width: 110 }}>
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {values.map((value) => (
              <tr key={rowKeyOf(value)}>
                <td
                  className="break-words border-r border-slate-100 px-3 py-2 text-slate-800 [overflow-wrap:anywhere]"
                  style={{ width: valueColumnWidths.canonicalValue }}
                >
                  {editableValueCell(value, "canonicalValue", String(value.canonicalValue ?? ""))}
                </td>
                <td
                  className="break-words border-r border-slate-100 px-3 py-2 text-slate-600 [overflow-wrap:anywhere]"
                  style={{ width: valueColumnWidths.displayName }}
                >
                  {editableValueCell(value, "displayName", String(value.displayName ?? ""))}
                </td>
                <td
                  className="break-words px-3 py-2 text-slate-600 [overflow-wrap:anywhere]"
                  style={{ width: valueColumnWidths.aliasNames }}
                >
                  {editableValueCell(value, "aliasNames", valueAliases(value).join("、"))}
                </td>
                {canDeleteValues && (
                  <td className="px-3 py-2 align-top" style={{ width: 110 }}>
                    <Button
                      danger
                      className="min-h-8 px-2 py-1 text-xs"
                      loading={savingKey === `delete:${rowKeyOf(value)}`}
                      disabled={!value.id}
                      onClick={() => void deleteValue(value)}
                    >
                      删除
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
