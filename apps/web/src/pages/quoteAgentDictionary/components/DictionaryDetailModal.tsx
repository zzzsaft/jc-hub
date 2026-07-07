import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Tag } from "@/components/ui/core";
import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "../../quoteAgent/types";
import { filterAliasList } from "../utils";
import { DictionaryDetailValueTable } from "./DictionaryDetailValueTable";
import { DictionaryTermDetailSection } from "./DictionaryTermDetailSection";
import {
  productLabel,
  productValue,
  readValueColumnWidths,
  writeValueColumnWidths,
} from "./dictionaryDetailModal.utils";
import type { EditingTermField, EditingValueCell } from "./dictionaryDetailModal.utils";

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
  const [valueColumnWidths, setValueColumnWidths] = useState(readValueColumnWidths);

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
          <DictionaryTermDetailSection
            standardValue={standardValue}
            termType={termType}
            productOptions={productOptions}
            valueKindOptions={valueKindOptions}
            editingTermField={editingTermField}
            savingKey={savingKey}
            onEditChange={setEditingTermField}
            onUpdateTermType={onUpdateTermType}
            onSavingKeyChange={setSavingKey}
          />
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
          <DictionaryDetailValueTable
            values={values}
            canDeleteValues={Boolean(onDeleteValue)}
            savingKey={savingKey}
            editingValueCell={editingValueCell}
            valueColumnWidths={valueColumnWidths}
            onCreateValue={onCreateValue}
            onUpdateValue={onUpdateValue}
            onDeleteValue={onDeleteValue}
            onEditChange={setEditingValueCell}
            onSavingKeyChange={setSavingKey}
            onColumnWidthsChange={setValueColumnWidths}
          />
        )}
      </div>
    </Modal>
  );
}
