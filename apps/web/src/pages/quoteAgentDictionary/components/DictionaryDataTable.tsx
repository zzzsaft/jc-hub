import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
} from "@tanstack/react-table";
import { Button, Input, Spinner } from "@/components/ui/core";
import {
  readPersistedState,
  writePersistedState,
} from "./DictionaryDataTable.storage";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    filterOptions?: (row: TData) => Array<string | { label: string; value: string }>;
  }
}

type Props<T> = {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  getRowId: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  storageKey: string;
};

export function DictionaryDataTable<T>({
  columns,
  data,
  loading,
  getRowId,
  onRowClick,
  storageKey,
}: Props<T>) {
  const persistedState = useMemo(() => readPersistedState(storageKey), [storageKey]);
  const [sorting, setSorting] = useState<SortingState>(persistedState.sorting ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    persistedState.columnFilters ?? [],
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    persistedState.columnSizing ?? {},
  );
  const [activeFilter, setActiveFilter] = useState("");
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const filterPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writePersistedState(storageKey, { sorting, columnFilters, columnSizing });
  }, [columnFilters, columnSizing, sorting, storageKey]);

  useEffect(() => {
    if (!activeFilter) return undefined;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (filterPanelRef.current?.contains(event.target as Node)) return;
      setActiveFilter("");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [activeFilter]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      columnSizing,
    },
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableWidth = Math.max(table.getCenterTotalSize(), 900);

  return (
    <div className="relative max-h-[calc(100vh-19rem)] min-h-80 w-full max-w-full overflow-auto rounded border border-slate-200 bg-white shadow-sm">
      {loading && (
        <div className="absolute inset-x-0 top-0 z-40 bg-white/80 p-3">
          <Spinner />
        </div>
      )}
      <table
        className="table-fixed divide-y divide-slate-200 text-sm"
        style={{ width: tableWidth, minWidth: tableWidth }}
      >
        <thead className="sticky top-0 z-10 bg-slate-50/95">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const column = header.column;
                const filterValue = String(column.getFilterValue() ?? "");
                const sorted = column.getIsSorted();
                const canFilter = column.getCanFilter();
                const filterSearchText = filterSearch[column.id] ?? "";
                const filterOptions = column.columnDef.meta?.filterOptions
                  ? Array.from(
                      new Map(
                        data
                          .flatMap((row) => column.columnDef.meta?.filterOptions?.(row) ?? [])
                          .map((option) => {
                            if (typeof option === "string") {
                              const value = option.trim();
                              return value ? [value, { label: value, value }] : null;
                            }
                            const value = String(option.value ?? "").trim();
                            const label = String(option.label ?? option.value ?? "").trim();
                            return value ? [value, { label: label || value, value }] : null;
                          })
                          .filter(Boolean) as Array<[string, { label: string; value: string }]>,
                      ).values(),
                    )
                  : Array.from(
                      new Map(
                        data
                          .map((row, index) => String(column.accessorFn?.(row, index) ?? "").trim())
                          .filter(Boolean)
                          .map((value) => [value, { label: value, value }] as [string, { label: string; value: string }]),
                      ).values(),
                    );
                const visibleFilterOptions = filterOptions
                  .filter((option) =>
                    [option.label, option.value]
                      .join(" ")
                      .toLowerCase()
                      .includes(filterSearchText.trim().toLowerCase()),
                  )
                  .slice(0, 10);
                return (
                  <th
                    key={header.id}
                    className="group relative border-r border-slate-300 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0"
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex min-h-6 items-center gap-1.5 pr-4">
                      <button
                        type="button"
                        className="min-w-0 flex-1 appearance-none truncate border-0 bg-transparent p-0 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 outline-none transition hover:text-slate-800 focus-visible:text-brand-700"
                        onClick={column.getToggleSortingHandler()}
                      >
                        {flexRender(column.columnDef.header, header.getContext())}
                      </button>
                      <span
                        className={[
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] leading-none transition",
                          sorted ? "text-brand-600" : "text-slate-300 opacity-0 group-hover:opacity-100",
                        ].join(" ")}
                      >
                        {sorted === "asc" ? "^" : sorted === "desc" ? "v" : "-"}
                      </span>
                      {canFilter && (
                        <button
                          type="button"
                          aria-label={`Filter ${String(column.columnDef.header ?? column.id)}`}
                          className={[
                            "inline-flex h-5 w-5 shrink-0 appearance-none items-center justify-center rounded border-0 bg-transparent p-0 text-[11px] outline-none transition",
                            filterValue
                              ? "bg-brand-50 text-brand-700"
                              : "text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100",
                          ].join(" ")}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveFilter((current) => current === column.id ? "" : column.id);
                          }}
                        >
                          {filterValue ? "*" : "f"}
                        </button>
                      )}
                    </div>
                    {activeFilter === column.id && (
                      <div
                        ref={filterPanelRef}
                        className="absolute left-2 top-full z-20 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 normal-case tracking-normal shadow-lg"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex gap-1">
                          <Input
                            className="h-7 text-xs font-normal"
                            value={filterSearchText}
                            placeholder={`Search ${String(column.columnDef.header ?? column.id)}`}
                            onChange={(event: any) =>
                              setFilterSearch((current) => ({ ...current, [column.id]: event.target.value }))
                            }
                          />
                          <Button
                            className="min-h-7 px-2 py-0 text-xs"
                            onClick={() => {
                              column.setFilterValue("");
                              setFilterSearch((current) => ({ ...current, [column.id]: "" }));
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-100 bg-white py-1">
                          {visibleFilterOptions.length ? (
                            visibleFilterOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={[
                                  "block w-full appearance-none truncate border-0 bg-transparent px-2.5 py-1.5 text-left text-xs font-normal outline-none transition",
                                  filterValue === option.value
                                    ? "bg-brand-50 text-brand-700"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:bg-slate-50",
                                ].join(" ")}
                                onClick={() => {
                                  column.setFilterValue(option.value);
                                  setActiveFilter("");
                                }}
                              >
                                {option.label}
                              </button>
                            ))
                          ) : (
                            <div className="px-2 py-3 text-center text-xs font-normal text-slate-400">
                              No options
                            </div>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-slate-400">
                          Showing {visibleFilterOptions.length} of {filterOptions.length}
                        </div>
                      </div>
                    )}
                    {column.getCanResize() && (
                      <button
                        type="button"
                        aria-label={`Resize ${column.id}`}
                        className={[
                          "absolute bottom-0 right-0 top-0 z-30 w-2 cursor-col-resize touch-none appearance-none border-0 border-r border-transparent bg-transparent p-0 outline-none transition",
                          header.column.getIsResizing()
                            ? "border-brand-500 bg-brand-100/70"
                            : "hover:border-brand-400 hover:bg-brand-50/80",
                        ].join(" ")}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="whitespace-normal break-words border-r border-slate-200 px-3 py-2.5 text-slate-700 last:border-r-0"
                  style={{ width: cell.column.getSize() }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {!loading && table.getRowModel().rows.length === 0 && (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={columns.length}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
