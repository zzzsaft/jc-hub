import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Tag } from "@/components/ui/core";
import { EditOutlined } from "@/components/ui/icons";
import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "../../quoteAgent/types";
import { DictionaryDataTable } from "./DictionaryDataTable";
import { DictionaryDetailModal } from "./DictionaryDetailModal";
import { dedupeDictionaryValues, filterAliasList, termTypeKey } from "../utils";

type Props = {
  loading: boolean;
  rows: DictionaryTermType[];
  values: DictionaryValue[];
  productTypes: ProductTypeOption[];
  onEdit: (record: DictionaryTermType) => void;
  onCreateValue: (termType?: string) => void;
  onEditValue: (record: DictionaryValue) => void;
  onUpdateTermType: (record: DictionaryTermType, patch: Partial<DictionaryTermType>) => Promise<void>;
  onUpdateValue: (record: DictionaryValue, patch: Partial<DictionaryValue>) => Promise<void>;
  onDeleteValue: (record: DictionaryValue) => Promise<void>;
};

const aliasesOf = (record: DictionaryTermType) => filterAliasList(record.aliasNames ?? record.aliases ?? []);
const compactStrings = (values: Array<string | undefined | null>) =>
  values.map((value) => String(value ?? "").trim()).filter(Boolean);

export function TermTypeTable({
  loading,
  rows,
  values,
  productTypes,
  onEdit,
  onCreateValue,
  onEditValue,
  onUpdateTermType,
  onUpdateValue,
  onDeleteValue,
}: Props) {
  const [detailRecord, setDetailRecord] = useState<DictionaryTermType | null>(null);

  const columns = useMemo<ColumnDef<DictionaryTermType, any>[]>(
    () => [
      {
        id: "termType",
        header: "TermType",
        accessorFn: (record) =>
          [record.termType, record.displayName, record.quoteDisplayName].filter(Boolean).join(" "),
        meta: {
          filterOptions: (record) => {
            const value = String(record.termType ?? "").trim();
            const label = [record.termType, record.displayName || record.quoteDisplayName]
              .filter(Boolean)
              .join(" / ");
            return value ? [{ value, label }] : [];
          },
        },
        size: 240,
        minSize: 120,
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
            <div className="font-medium text-slate-900">{row.original.termType || "-"}</div>
            <div className="text-xs text-slate-500">
              {row.original.displayName || row.original.quoteDisplayName || "-"}
            </div>
          </div>
        ),
      },
      {
        id: "quoteDisplayName",
        header: "Quote Label",
        accessorFn: (record) => record.quoteDisplayName ?? "",
        meta: { filterOptions: (record) => compactStrings([record.quoteDisplayName]) },
        size: 160,
        minSize: 100,
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        id: "category",
        header: "Category",
        accessorFn: (record) => record.category ?? "",
        meta: { filterOptions: (record) => compactStrings([record.category]) },
        size: 140,
        minSize: 100,
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        id: "valueKind",
        header: "Value Kind",
        accessorFn: (record) => record.valueKind ?? "",
        meta: { filterOptions: (record) => compactStrings([record.valueKind]) },
        size: 120,
        minSize: 100,
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        id: "applicableProductTypes",
        header: "Product Types",
        accessorFn: (record) => (record.applicableProductTypes ?? []).join(" "),
        meta: { filterOptions: (record) => record.applicableProductTypes ?? [] },
        size: 260,
        minSize: 140,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap gap-1">
            {(row.original.applicableProductTypes ?? []).length ? (
              row.original.applicableProductTypes?.map((item) => (
                <Tag key={item} className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
                  {item}
                </Tag>
              ))
            ) : (
              <span className="text-slate-400">All</span>
            )}
          </div>
        ),
      },
      {
        id: "aliases",
        header: "Alias",
        accessorFn: (record) => aliasesOf(record).join(" "),
        meta: { filterOptions: aliasesOf },
        size: 280,
        minSize: 140,
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-normal break-words text-slate-600 [overflow-wrap:anywhere]">
            {aliasesOf(row.original).join(", ") || "-"}
          </div>
        ),
      },
      {
        id: "sortOrder",
        header: "Sort",
        accessorFn: (record) => record.sortOrder ?? "",
        meta: { filterOptions: (record) => (record.sortOrder == null ? [] : [String(record.sortOrder)]) },
        size: 90,
        minSize: 80,
        cell: ({ getValue }) => <div className="text-right">{getValue() ?? "-"}</div>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableColumnFilter: false,
        size: 90,
        minSize: 80,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={(event: any) => {
                event.stopPropagation();
                onEdit(row.original);
              }}
            >
              Edit
            </Button>
          </div>
        ),
      },
    ],
    [onEdit],
  );

  const currentDetailRecord = detailRecord
    ? rows.find((record) => termTypeKey(record) === termTypeKey(detailRecord)) ?? detailRecord
    : null;
  const detailValues = currentDetailRecord
    ? dedupeDictionaryValues(
        values.filter((value) => String(value.termType ?? "") === String(currentDetailRecord.termType ?? "")),
      )
    : [];

  return (
    <>
      <DictionaryDataTable
        storageKey="quote-agent-dictionary-term-types-table"
        loading={loading}
        columns={columns}
        data={rows}
        getRowId={(record) => termTypeKey(record)}
        onRowClick={setDetailRecord}
      />
      <DictionaryDetailModal
        open={Boolean(currentDetailRecord)}
        title="字段类型详情"
        standardValue={String(currentDetailRecord?.termType ?? "")}
        aliases={currentDetailRecord ? aliasesOf(currentDetailRecord) : []}
        values={detailValues}
        termType={currentDetailRecord ?? undefined}
        productTypes={productTypes}
        onClose={() => setDetailRecord(null)}
        onCreateValue={
          currentDetailRecord
            ? () => {
                onCreateValue(currentDetailRecord.termType);
              }
            : undefined
        }
        onEditValue={onEditValue}
        onUpdateTermType={
          currentDetailRecord
            ? async (patch) => {
                await onUpdateTermType(currentDetailRecord, patch);
                setDetailRecord((current) => (current ? { ...current, ...patch } : current));
              }
            : undefined
        }
        onUpdateValue={onUpdateValue}
        onDeleteValue={onDeleteValue}
      />
    </>
  );
}
