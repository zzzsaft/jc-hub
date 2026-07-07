import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Button, Input, Modal, Select, Tag } from "@/components/ui/core";
import { EditOutlined } from "@/components/ui/icons";
import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "../../quoteAgent/types";
import { filterAliasList, textList } from "../utils";
import { AliasTagInput } from "./AliasTagInput";
import { ProductScopeMultiSelect } from "./ProductScopeMultiSelect";

type ValueField = "canonicalValue" | "displayName" | "aliasNames";
type ValueColumnWidthMap = Record<ValueField, number>;
type TermField =
  | "termType"
  | "displayName"
  | "category"
  | "valueKind"
  | "aliasNames"
  | "applicableProductTypes";

type Props = {
  open: boolean;
  title: string;
  standardValue: string;
  aliases: string[];
  values?: DictionaryValue[];
  termType?: DictionaryTermType;
  productTypes?: ProductTypeOption[];
  onClose: () => void;
  onEdit?: () => void;
  onCreateValue?: () => void;
  onEditValue?: (value: DictionaryValue) => void;
  onUpdateTermType?: (patch: Partial<DictionaryTermType>) => Promise<void>;
  onUpdateValue?: (value: DictionaryValue, patch: Partial<DictionaryValue>) => Promise<void>;
  onDeleteValue?: (value: DictionaryValue) => Promise<void>;
};

type EditingValueCell = {
  rowKey: string;
  field: ValueField;
  draft: string;
};

type EditingTermField = {
  field: TermField;
  draft: string;
};

const VALUE_TABLE_WIDTHS_STORAGE_KEY = "quote-agent-dictionary-detail-values-column-widths";
const DEFAULT_VALUE_COLUMN_WIDTHS: ValueColumnWidthMap = {
  canonicalValue: 320,
  displayName: 280,
  aliasNames: 260,
};

const rowKeyOf = (value: DictionaryValue) =>
  String(value.id ?? `${value.termType ?? ""}:${value.canonicalValue ?? ""}`);

const valueAliases = (value: DictionaryValue) =>
  filterAliasList(value.aliasNames ?? value.aliases ?? [], [value.canonicalValue]);

const termAliases = (value?: DictionaryTermType) => filterAliasList(value?.aliasNames ?? value?.aliases ?? []);

const joinTextList = (values: string[]) => values.join("\n");

const productValue = (item: ProductTypeOption) =>
  String(item.canonicalValue ?? item.value ?? item.displayName ?? item.label ?? "").trim();

const productLabel = (item: ProductTypeOption) =>
  String(item.displayName ?? item.label ?? item.canonicalValue ?? item.value ?? "").trim();

function readValueColumnWidths(): ValueColumnWidthMap {
  if (typeof window === "undefined") return DEFAULT_VALUE_COLUMN_WIDTHS;
  try {
    const saved = window.localStorage.getItem(VALUE_TABLE_WIDTHS_STORAGE_KEY);
    if (!saved) return DEFAULT_VALUE_COLUMN_WIDTHS;
    const parsed = JSON.parse(saved) as Partial<ValueColumnWidthMap>;
    return {
      canonicalValue: Number(parsed.canonicalValue) || DEFAULT_VALUE_COLUMN_WIDTHS.canonicalValue,
      displayName: Number(parsed.displayName) || DEFAULT_VALUE_COLUMN_WIDTHS.displayName,
      aliasNames: Number(parsed.aliasNames) || DEFAULT_VALUE_COLUMN_WIDTHS.aliasNames,
    };
  } catch {
    return DEFAULT_VALUE_COLUMN_WIDTHS;
  }
}

function writeValueColumnWidths(widths: ValueColumnWidthMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VALUE_TABLE_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

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

export function DictionaryDetailModal({
  open,
  title,
  standardValue,
  aliases,
  values = [],
  termType,
  productTypes = [],
  onClose,
  onEdit,
  onCreateValue,
  onUpdateTermType,
  onUpdateValue,
  onDeleteValue,
}: Props) {
  const [editingValueCell, setEditingValueCell] = useState<EditingValueCell | null>(null);
  const [editingTermField, setEditingTermField] = useState<EditingTermField | null>(null);
  const [savingKey, setSavingKey] = useState("");
  const [valueColumnWidths, setValueColumnWidths] = useState<ValueColumnWidthMap>(readValueColumnWidths);

  useEffect(() => {
    if (!open) {
      setEditingValueCell(null);
      setEditingTermField(null);
    }
  }, [open]);

  useEffect(() => {
    writeValueColumnWidths(valueColumnWidths);
  }, [valueColumnWidths]);

  const productOptions = useMemo(() => {
    const options = productTypes
      .map((item) => ({ value: productValue(item), label: productLabel(item) }))
      .filter((item) => item.value);
    (termType?.applicableProductTypes ?? []).forEach((value) => {
      if (!options.some((option) => option.value === value)) options.push({ value, label: value });
    });
    return options;
  }, [productTypes, termType?.applicableProductTypes]);

  const valueKindOptions = useMemo(
    () =>
      Array.from(
        new Set(["text", "enum", "enums", "number", "number_unit", "boolean", termType?.valueKind].filter(Boolean)),
      ).map((value) => ({ value: String(value), label: String(value) })),
    [termType?.valueKind],
  );

  const canDeleteValues = Boolean(onDeleteValue);
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
      setValueColumnWidths((current) => ({ ...current, [field]: nextWidth }));
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

  const startTermEdit = (field: TermField) => {
    if (!termType) return;
    const draft =
      field === "aliasNames"
        ? joinTextList(termAliases(termType))
        : field === "applicableProductTypes"
          ? joinTextList(termType.applicableProductTypes ?? [])
          : String(termType[field] ?? "");
    setEditingTermField({ field, draft });
  };

  const saveTermEdit = async () => {
    if (!editingTermField || !onUpdateTermType) return;
    const field = editingTermField.field;
    const draft = editingTermField.draft.trim();
    const patch =
      field === "aliasNames"
        ? { aliasNames: textList(editingTermField.draft) }
        : field === "applicableProductTypes"
          ? { applicableProductTypes: textList(editingTermField.draft) }
          : { [field]: draft };

    setSavingKey(`term:${field}`);
    try {
      await onUpdateTermType(patch);
      setEditingTermField(null);
    } finally {
      setSavingKey("");
    }
  };

  const renderTermEditor = (field: TermField) => {
    if (!editingTermField || editingTermField.field !== field) return null;
    const isSaving = savingKey === `term:${field}`;

    if (field === "aliasNames") {
      return (
        <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <AliasTagInput
            value={editingTermField.draft}
            placeholder="添加 alias"
            onChange={(nextValue) => setEditingTermField({ field, draft: nextValue })}
          />
          <div className="flex shrink-0 gap-1.5 pt-1">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => setEditingTermField(null)}>
              取消
            </Button>
            <Button type="primary" className="min-h-7 px-2 py-1 text-xs" loading={isSaving} onClick={saveTermEdit}>
              保存
            </Button>
          </div>
        </div>
      );
    }

    if (field === "applicableProductTypes") {
      return (
        <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <ProductScopeMultiSelect
            value={textList(editingTermField.draft)}
            options={productOptions}
            placeholder="搜索产品范围"
            onChange={(nextValues) => setEditingTermField({ field, draft: joinTextList(nextValues) })}
          />
          <div className="flex shrink-0 gap-1.5 pt-1">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => setEditingTermField(null)}>
              取消
            </Button>
            <Button type="primary" className="min-h-7 px-2 py-1 text-xs" loading={isSaving} onClick={saveTermEdit}>
              保存
            </Button>
          </div>
        </div>
      );
    }

    if (field === "valueKind") {
      return (
        <Select
          value={editingTermField.draft}
          options={valueKindOptions}
          onChange={(value: string) => setEditingTermField({ field, draft: value })}
          onBlur={() => void saveTermEdit()}
        />
      );
    }

    return (
      <Input
        autoFocus
        disabled={isSaving}
        className="h-10 text-sm"
        value={editingTermField.draft}
        onChange={(event: any) => setEditingTermField({ field, draft: event.target.value })}
        onBlur={() => void saveTermEdit()}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setEditingTermField(null);
          }
        }}
      />
    );
  };

  const editableTermField = (field: TermField, label: string, text: string, wide = false) => {
    const editor = renderTermEditor(field);
    return (
      <div className={wide ? "md:col-span-3" : ""}>
        <div className="mb-1 text-xs text-slate-500">{label}</div>
        {editor ?? (
          <div className="flex min-h-10 items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="min-w-0 break-words font-medium text-slate-800 [overflow-wrap:anywhere]">
              {field === "aliasNames" ? <AliasTags aliases={termAliases(termType)} /> : text || "-"}
            </span>
            {onUpdateTermType &&
              iconButton(`编辑${label}`, (event) => {
                event.stopPropagation();
                startTermEdit(field);
              })}
          </div>
        )}
      </div>
    );
  };

  const startValueEdit = (value: DictionaryValue, field: ValueField) => {
    const draft = field === "aliasNames" ? joinTextList(valueAliases(value)) : String(value[field] ?? "");
    setEditingValueCell({ rowKey: rowKeyOf(value), field, draft });
  };

  const saveValueEdit = async (value: DictionaryValue) => {
    if (!editingValueCell || !onUpdateValue) return;
    const current =
      editingValueCell.field === "aliasNames"
        ? joinTextList(valueAliases(value))
        : String(value[editingValueCell.field] ?? "");

    if (editingValueCell.draft.trim() === current.trim()) {
      setEditingValueCell(null);
      return;
    }

    const patch =
      editingValueCell.field === "aliasNames"
        ? { aliasNames: textList(editingValueCell.draft, [value.canonicalValue]) }
        : { [editingValueCell.field]: editingValueCell.draft.trim() };
    const cellKey = `${rowKeyOf(value)}:${editingValueCell.field}`;
    setSavingKey(cellKey);
    try {
      await onUpdateValue(value, patch);
      setEditingValueCell(null);
    } finally {
      setSavingKey("");
    }
  };

  const deleteValue = async (value: DictionaryValue) => {
    if (!onDeleteValue) return;
    const label = [value.displayName, value.canonicalValue].filter(Boolean).join(" / ") || "该标准值";
    if (!window.confirm(`确认删除标准值「${label}」？删除后不可在前端恢复。`)) return;

    setSavingKey(`delete:${rowKeyOf(value)}`);
    try {
      await onDeleteValue(value);
      if (editingValueCell?.rowKey === rowKeyOf(value)) setEditingValueCell(null);
    } finally {
      setSavingKey("");
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
              setEditingValueCell((current) => (current ? { ...current, draft: nextValue } : current))
            }
          />
          <div className="flex justify-end gap-1.5">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => setEditingValueCell(null)}>
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
            setEditingValueCell((current) => (current ? { ...current, draft: event.target.value } : current))
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
              setEditingValueCell(null);
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
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={
        <>
          {!termType && onEdit && <Button onClick={onEdit}>编辑</Button>}
          <Button type="primary" onClick={onClose}>
            关闭
          </Button>
        </>
      }
      width={760}
    >
      <div className="space-y-4 text-sm">
        {termType ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {editableTermField("termType", "TermType ID", String(termType.termType ?? standardValue ?? ""), true)}
            {editableTermField("displayName", "显示名", String(termType.displayName ?? ""))}
            {editableTermField("category", "分类", String(termType.category ?? ""))}
            {editableTermField("valueKind", "值类型", String(termType.valueKind ?? ""))}
            {editableTermField("aliasNames", "Alias", termAliases(termType).join("、"), true)}
            {editableTermField(
              "applicableProductTypes",
              "适用产品范围",
              (termType.applicableProductTypes ?? []).join("、") || "All",
              true,
            )}
          </section>
        ) : (
          <>
            <section>
              <div className="mb-1 font-medium text-slate-700">标准值</div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900">
                {standardValue || "-"}
              </div>
            </section>
            <section>
              <div className="mb-1 font-medium text-slate-700">Alias</div>
              <div className="flex min-h-10 flex-wrap gap-1 rounded border border-slate-200 bg-white p-2">
                <AliasTags aliases={filterAliasList(aliases, [standardValue])} />
              </div>
            </section>
          </>
        )}

        {!!values.length && (
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
        )}
      </div>
    </Modal>
  );
}
