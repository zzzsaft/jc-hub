import { Button, Input, Select, Tag } from "@/components/ui/core";
import { EditOutlined } from "@/components/ui/icons";
import type { MouseEvent } from "react";
import type { DictionaryTermType } from "../../quoteAgent/types";
import { textList } from "../utils";
import { AliasTagInput } from "./AliasTagInput";
import { ProductScopeMultiSelect } from "./ProductScopeMultiSelect";
import type { EditingTermField, TermField } from "./dictionaryDetailModal.utils";
import { joinTextList, termAliases } from "./dictionaryDetailModal.utils";

type Props = {
  standardValue: string;
  termType: DictionaryTermType;
  productOptions: Array<{ value: string; label: string }>;
  valueKindOptions: Array<{ value: string; label: string }>;
  editingTermField: EditingTermField | null;
  savingKey: string;
  onEditChange: (value: EditingTermField | null) => void;
  onUpdateTermType?: (patch: Partial<DictionaryTermType>) => Promise<void>;
  onSavingKeyChange: (value: string) => void;
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

export function DictionaryTermDetailSection({
  standardValue,
  termType,
  productOptions,
  valueKindOptions,
  editingTermField,
  savingKey,
  onEditChange,
  onUpdateTermType,
  onSavingKeyChange,
}: Props) {
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
    const draft =
      field === "aliasNames"
        ? joinTextList(termAliases(termType))
        : field === "applicableProductTypes"
          ? joinTextList(termType.applicableProductTypes ?? [])
          : String(termType[field] ?? "");
    onEditChange({ field, draft });
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

    onSavingKeyChange(`term:${field}`);
    try {
      await onUpdateTermType(patch);
      onEditChange(null);
    } finally {
      onSavingKeyChange("");
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
            onChange={(nextValue) => onEditChange({ field, draft: nextValue })}
          />
          <div className="flex shrink-0 gap-1.5 pt-1">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => onEditChange(null)}>
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
            onChange={(nextValues) => onEditChange({ field, draft: joinTextList(nextValues) })}
          />
          <div className="flex shrink-0 gap-1.5 pt-1">
            <Button className="min-h-7 px-2 py-1 text-xs" onClick={() => onEditChange(null)}>
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
          onChange={(value: string) => onEditChange({ field, draft: value })}
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
        onChange={(event: any) => onEditChange({ field, draft: event.target.value })}
        onBlur={() => void saveTermEdit()}
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

  return (
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
  );
}
