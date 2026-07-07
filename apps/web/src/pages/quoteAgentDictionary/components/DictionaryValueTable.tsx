import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button, Tag } from "@/components/ui/core";
import { EditOutlined } from "@/components/ui/icons";
import type { DictionaryValue } from "../../quoteAgent/types";
import { DictionaryDataTable } from "./DictionaryDataTable";
import { DictionaryDetailModal } from "./DictionaryDetailModal";
import { filterAliasList, valueKey } from "../utils";

type Props = {
  loading: boolean;
  rows: DictionaryValue[];
  onEdit: (record: DictionaryValue) => void;
};

const aliasesOf = (record: DictionaryValue) =>
  filterAliasList(record.aliasNames ?? record.aliases ?? [], [record.canonicalValue, record.displayName]);
const compactStrings = (values: Array<string | undefined | null>) =>
  values.map((value) => String(value ?? "").trim()).filter(Boolean);

export function DictionaryValueTable({ loading, rows, onEdit }: Props) {
  const [detailRecord, setDetailRecord] = useState<DictionaryValue | null>(null);
  const columns = useMemo<ColumnDef<DictionaryValue, any>[]>(
    () => [
      {
        id: "termType",
        header: "TermType",
        accessorFn: (record) => record.termType ?? "",
        meta: { filterOptions: (record) => compactStrings([record.termType]) },
        size: 240,
        minSize: 120,
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        id: "canonicalValue",
        header: "Canonical Value",
        accessorFn: (record) => [record.canonicalValue, record.displayName].filter(Boolean).join(" "),
        meta: {
          filterOptions: (record) => compactStrings([record.canonicalValue, record.displayName]),
        },
        size: 260,
        minSize: 140,
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
            <div className="font-medium text-slate-900">{row.original.canonicalValue || "-"}</div>
            <div className="text-xs text-slate-500">{row.original.displayName || "-"}</div>
          </div>
        ),
      },
      {
        id: "aliases",
        header: "Alias",
        accessorFn: (record) => aliasesOf(record).join(" "),
        meta: { filterOptions: aliasesOf },
        size: 520,
        minSize: 180,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap gap-1">
            {aliasesOf(row.original).length
              ? aliasesOf(row.original).map((item) => (
                  <Tag key={item} className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere]">
                    {item}
                  </Tag>
                ))
              : <span className="text-slate-400">-</span>}
          </div>
        ),
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

  return (
    <>
      <DictionaryDataTable
        storageKey="quote-agent-dictionary-values-table"
        loading={loading}
        columns={columns}
        data={rows}
        getRowId={(record) => valueKey(record)}
        onRowClick={setDetailRecord}
      />
      <DictionaryDetailModal
        open={Boolean(detailRecord)}
        title="标准值详情"
        standardValue={String(detailRecord?.canonicalValue ?? "")}
        aliases={detailRecord ? aliasesOf(detailRecord) : []}
        onClose={() => setDetailRecord(null)}
        onEdit={detailRecord ? () => {
          onEdit(detailRecord);
          setDetailRecord(null);
        } : undefined}
      />
    </>
  );
}
