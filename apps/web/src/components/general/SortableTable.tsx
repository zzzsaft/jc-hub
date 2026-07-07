// SortableTable.tsx
import React, { useContext, useMemo, useState, useEffect } from "react";
import { HolderOutlined } from "@/components/ui/icons";
import type { DragEndEvent, UniqueIdentifier } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Table, TableProps } from "@/components/ui/core";
import type { ColumnsType } from "@/components/ui/types";
import { Resizable } from "react-resizable";
import "react-resizable/css/styles.css";

interface RowContextProps {
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  listeners?: SyntheticListenerMap;
}

const RowContext = React.createContext<RowContextProps>({});

export const DragHandle: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      icon={<HolderOutlined />}
      style={{ cursor: disabled ? "not-allowed" : "move" }}
      ref={setActivatorNodeRef}
      {...(!disabled ? listeners : {})}
      disabled={disabled}
    />
  );
};

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  "data-row-key": string;
}

const Row: React.FC<RowProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"] });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 3000 } : {}),
  };

  const contextValue = useMemo<RowContextProps>(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners]
  );

  return (
    <RowContext.Provider value={contextValue}>
      <tr
        onClick={(e) => {
          // 阻止冒泡，避免拖拽干扰
          const target = e.target as Element;
          if (target.closest(".ant-table-row-expand-icon")) {
            e.stopPropagation();
          }
        }}
        {...props}
        ref={setNodeRef}
        style={style}
        {...attributes}
      />
    </RowContext.Provider>
  );
};

interface ResizableTitleProps
  extends Omit<React.HTMLAttributes<HTMLTableCellElement>, "onResize"> {
  width?: number;
  onResize?: (
    e: React.SyntheticEvent,
    data: { size: { width: number } }
  ) => void;
}

const ResizableTitle: React.FC<ResizableTitleProps> = ({
  onResize,
  width,
  ...restProps
}) => {
  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

interface SortableTableProps<T extends { id: UniqueIdentifier; index?: number }>
  extends TableProps<T> {
  onDragEnd?: (data: T[]) => void;
  sortable?: boolean;
  rowKey?: keyof T; // 改为可选，默认使用 'id'
  hiddenColumns?: string[];
}

export function SortableTable<
  T extends {
    id: UniqueIdentifier;
    index?: number;
    parentId?: number | undefined;
  }
>({
  dataSource = [],
  onDragEnd,
  sortable = true,
  rowKey = "id", // 默认使用 'id'
  hiddenColumns = [],
  ...props
}: SortableTableProps<T>) {
  const { columns = [], ...rest } = props;

  const [colState, setColState] = useState<ColumnsType<T>>(
    (columns as ColumnsType<T>) ?? []
  );

  useEffect(() => {
    setColState((prev) =>
      (columns as ColumnsType<T>).map((col, index) => ({
        ...col,
        width: prev[index]?.width ?? (col as any).width,
      }))
    );
  }, [columns]);

  const visibleColumns = useMemo(
    () => colState.filter((c) => !hiddenColumns.includes(String(c.key))),
    [colState, hiddenColumns]
  );

  const handleResizeColumn =
    (index: number) =>
    (_: any, { size }: { size: { width: number } }) => {
      setColState((cols) => {
        const next = [...cols];
        next[index] = { ...next[index], width: size.width };
        return next;
      });
    };

  const mergedColumns = useMemo(
    () =>
      visibleColumns.map((col, index) => ({
        ...col,
        onHeaderCell: (column: any) =>
          ({
            width: column.width,
            onResize: handleResizeColumn(index),
          } as ResizableTitleProps),
      })) as ColumnsType<T>,
    [colState, visibleColumns]
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeItem = dataSource.find(
      (item) => item[rowKey as keyof T] === active.id
    );
    const overItem = dataSource.find(
      (item) => item[rowKey as keyof T] === over.id
    );
    // if (
    //   activeItem?.parentId &&
    //   !overItem?.parentId &&
    //   activeItem.parentId !== overItem?.id
    // ) {
    //   return;
    // }
    const newData = arrayMove(
      [...dataSource],
      dataSource.findIndex((item) => item[rowKey as keyof T] === active.id),
      dataSource.findIndex((item) => item[rowKey as keyof T] === over.id)
    );

    // 更新index字段
    const dataWithIndex = newData.map((item, index) => ({
      ...item,
      index: index + 1,
    }));

    onDragEnd?.(dataWithIndex);
  };

  return (
    <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext
        items={dataSource?.map((item) => {
          const id = item[rowKey as keyof T];
          // 确保返回的是 UniqueIdentifier 或 { id: UniqueIdentifier }
          return typeof id === "string" || typeof id === "number"
            ? id
            : { id: String(id) };
        })}
        strategy={verticalListSortingStrategy}
      >
        <Table<T>
          {...rest}
          columns={mergedColumns}
          dataSource={dataSource}
          rowKey={rowKey}
          components={{
            header: {
              cell: ResizableTitle,
            },
            body: {
              row: Row,
            },
          }}
        />
      </SortableContext>
    </DndContext>
  );
}

export default SortableTable;
