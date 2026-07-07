import { Button, Typography, App, Tooltip, Dropdown } from "@/components/ui/core";
import { PlusOutlined, DeleteOutlined, LinkOutlined } from "@/components/ui/icons";
import { useQuoteStore } from "@/store/useQuoteStore";
import ProductCascader from "./ProductCascader";
import { formatPrice } from "@/utils/value";
import { isTextSelecting } from "@/utils/dom";
import { QuoteItem } from "@/types/types";
import { getFormType } from "./productConfigForm/formType";
import { lazy, Suspense, useMemo, useState } from "react";
import SortableTable, { DragHandle } from "../general/SortableTable";
import { SortableColumn } from "../general/SortableColumn";

const ProductConfigModal = lazy(() => import("./productConfigForm/ProductConfigModal"));
interface QuoteItemsTableProps {
  quoteId: number;
  items: QuoteItem[];
  confirmDelete: (item: QuoteItem) => void;
}

// light color palette used for differentiating linked items
const linkColors = [
  "rgba(83, 196, 26, 0.2)",
  "rgba(24, 144, 255, 0.2)",
  "rgba(114, 46, 209, 0.2)",
  "rgba(19, 194, 194, 0.2)",
  "rgba(235, 47, 150, 0.2)",
  "rgba(250, 84, 28, 0.2)",
  "rgba(47, 84, 235, 0.2)",
  "rgba(250, 219, 20, 0.2)",
];

const flattenItems = (items: QuoteItem[]): QuoteItem[] => {
  const result: QuoteItem[] = [];
  items.forEach((item) => {
    result.push(item);
    // if (item.children) {
    //   result.push(...flattenItems(item.children));
    // }
  });
  return result;
};

const DesktopQuoteItemsTable: React.FC<QuoteItemsTableProps> = ({
  quoteId,
  confirmDelete,
  items,
}) => {
  const isLocked = useQuoteStore(
    (state) =>
      state.quotes.find((quote) => quote.id === quoteId)?.status == "locked" ||
      false
  );
  const isClosed = useQuoteStore(
    (state) => state.quotes.find((quote) => quote.id === quoteId)?.isClosed
  );
  const { addQuoteItem, updateQuoteItem, setQuoteItem } = useQuoteStore();
  const { message } = App.useApp();
  const loading = useQuoteStore((state) => state.loading);
  const [currentItem, setCurrentItem] = useState<QuoteItem>();

  const handleCascaderChange = (value: string[], record: QuoteItem) => {
    if (!value || value.length === 0) return;
    // let productName = value[value.length - 1] ?? "";
    // if (value[0] == "平模" || value[0] == "配套件") {
    //   productName = "";
    // }
    const formType = getFormType(value);
    updateQuoteItem(quoteId, record.id, {
      productCategory: value,
      isCompleted: false,
      // productName,
      formType,
    });
  };
  const [open, setOpen] = useState(false);

  const handleDragEnd = (newData: QuoteItem[]) => {
    setQuoteItem(quoteId, newData);
  };

  const handleRowClick = (record: QuoteItem) => {
    if (isTextSelecting()) return;

    const latest =
      useQuoteStore.getState().findItemById(items, record.id) ?? record;
    if (!latest.productCategory || latest.productCategory.length === 0) {
      message.warning("请先填写产品类型");
    } else {
      setCurrentItem(latest);
      setOpen(true);
    }
    console.log(record);
  };

  // const expandedRowKeys = useMemo(
  //   () => getDefaultExpandedRowKeys(items),
  //   [items]
  // );

  const flatItems = useMemo(() => flattenItems(items), [items]);

  const linkColorMap = useMemo(() => {
    const map = new Map<number, string>();
    let colorIndex = 0;
    flatItems.forEach((item) => {
      if (item.linkId && !map.has(item.linkId)) {
        map.set(item.linkId, linkColors[colorIndex % linkColors.length]);
        colorIndex += 1;
      }
    });
    return map;
  }, [flatItems]);

  const linkedTargets = useMemo(() => {
    const set = new Set<number>();
    flatItems.forEach((item) => {
      if (item.linkId) {
        set.add(item.linkId);
      }
    });
    return set;
  }, [flatItems]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    record?: QuoteItem;
  }>({ x: 0, y: 0, visible: false });

  const handleContextMenu = (
    e: React.MouseEvent<HTMLTableRowElement, MouseEvent>,
    record: QuoteItem
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true, record });
  };

  const columns = [
    {
      ...SortableColumn,
      render: (text: string, record: QuoteItem) => {
        let color: string | undefined;
        if (record.linkId) {
          color = linkColorMap.get(record.linkId);
        } else if (linkedTargets.has(record.id)) {
          color = linkColorMap.get(record.id);
        }
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: color,
            }}
          >
            <DragHandle disabled={isLocked} />
          </div>
        );
      },
    },
    {
      title: "",
      dataIndex: "isCompleted",

      width: 24,
      render: (completed: boolean, record: QuoteItem) => {
        const color = completed ? "green" : "red";
        const linkedName = record.linkId
          ? flatItems.find((i) => i.id === record.linkId)?.productName ?? ""
          : "";
        return record.linkId ? (
          <span style={{ display: "flex", justifyContent: "center" }}>
            <Tooltip title={linkedName}>
              <LinkOutlined style={{ fontSize: 10, color }} />
            </Tooltip>
          </span>
        ) : (
          <span
            style={{
              display: "flex",
              justifyContent: "center",
              color,
              fontSize: 10,
            }}
          >
            ●
          </span>
        );
      },
    },
    {
      title: "产品类型",
      dataIndex: "productCategory",
      width: 150,
      minWidth: 80,
      render: (value: string[], record: QuoteItem) => {
        if (!record) return null;
        const currentValue = record.productCategory ?? undefined;
        const isLinked = record.linkId ? true : false;
        return !(isLocked || isLinked || record.isCategoryLocked) ? (
          <div onClick={(e) => e.stopPropagation()}>
            <ProductCascader
              value={currentValue}
              onChange={(val) => handleCascaderChange(val, record)}
              disabled={isLocked || isLinked}
            />
          </div>
        ) : (
          <div>{value.at(-1)}</div>
        );
      },
    },
    {
      title: "产品名称",
      dataIndex: "productName",
      render: (value: string) => (
        <Typography.Text style={{ minWidth: "150px", display: "inline-block" }}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "品牌",
      dataIndex: "brand",
      width: 80,
      render: (value: string) => (
        <Typography.Text
          style={{
            width: "60px",
            whiteSpace: "nowrap",
            display: "inline-block",
          }}
        >
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "单价",
      dataIndex: "unitPrice",
      width: 120,
      render: (value: number) => (
        <Typography.Text
          style={{ whiteSpace: "nowrap", display: "inline-block" }}
        >
          ¥ {formatPrice(value)}
        </Typography.Text>
      ),
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 80,
      render: (value: number, record: QuoteItem) => (
        <Typography.Text
          style={{ whiteSpace: "nowrap", display: "inline-block" }}
        >
          {formatValueWithUnit(value, record.unit)}
        </Typography.Text>
      ),
    },
    {
      title: "折扣率(%)",
      dataIndex: "discountRate",
      width: 100,
      render: (value: number) => (
        <Typography.Text
          style={{ whiteSpace: "nowrap", display: "inline-block" }}
        >
          {value}%
        </Typography.Text>
      ),
    },
    {
      title: "小计",
      dataIndex: "subtotal",
      width: 120,
      render: (value: number) => (
        <Typography.Text
          strong
          style={{ whiteSpace: "nowrap", display: "inline-block" }}
        >
          ¥ {formatPrice(value)}
        </Typography.Text>
      ),
    },
    {
      title: "操作",
      width: 60,
      render: (text: string, record: QuoteItem) => (
        <Button
          size="small"
          icon={<DeleteOutlined />}
          danger
          onClick={(e) => {
            e.stopPropagation();
            confirmDelete(record);
          }}
          disabled={isLocked}
          aria-label="删除"
        />
      ),
    },
  ];

  return (
    <>
      <SortableTable
        size="small"
        onDragEnd={handleDragEnd}
        loading={loading.add || loading.getQuote}
        columns={columns}
        dataSource={items}
        rowKey="id"
        scroll={{ x: 1000 }}
        pagination={false}
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          onContextMenu: (e) => handleContextMenu(e, record),
        })}
        expandable={{
          // rowExpandable: (record) => {
          //   console.log(record, record.children && record.children.length > 0);
          //   return (record.children && record.children.length > 0) ?? false;
          // },
          showExpandColumn: false,
          indentSize: 50,
          defaultExpandAllRows: true,
          // expandedRowKeys: expandedRowKeys,
        }}
        footer={() => (
          <Button
            type="dashed"
            onClick={() => {
              const lastItem = items[items.length - 1];
              if (
                items.length > 0 &&
                (!lastItem.productCategory ||
                  lastItem.productCategory.length === 0)
              ) {
                message.warning("请先填写当前行的产品信息");
                return;
              }
              addQuoteItem(quoteId);
            }}
            disabled={isLocked}
            block
            icon={<PlusOutlined />}
          >
            新增产品
          </Button>
        )}
      />
      <Dropdown
        open={contextMenu.visible}
        menu={{
          style: {
            width: 100, // 设置宽度为 200px
          },
          items: [
            {
              key: "delete",
              label: "删除",
              danger: true,
              icon: <DeleteOutlined />,
              onClick: () => {
                if (contextMenu.record) {
                  confirmDelete(contextMenu.record);
                }
                setContextMenu((prev) => ({ ...prev, visible: false }));
              },
            },
          ],
        }}
        overlayStyle={{
          position: "fixed",
          left: contextMenu.x,
          top: contextMenu.y,
        }}
        onOpenChange={(open) => {
          if (!open) {
            setContextMenu((prev) => ({ ...prev, visible: false }));
          }
        }}
      >
        <div />
      </Dropdown>
      {open && (
        <Suspense fallback={null}>
          <ProductConfigModal
            open={open}
            setOpen={setOpen}
            quoteId={quoteId}
            quoteItem={currentItem ?? items[0]}
            isClosed={isClosed}
          />
        </Suspense>
      )}
    </>
  );
};

// const getDefaultExpandedRowKeys = (data: QuoteItem[]) => {
//   return data
//     .filter((item) => item.children && item.children.length > 0)
//     .map((item) => item.id);
// };
const formatValueWithUnit = (value: number | string, unit?: string) => {
  // 处理无效值
  if (value == null || value === "") return "-";

  // 数字类型处理
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  const isIntegerRequired = unit === "套";

  // 格式化数值
  const formattedValue = isIntegerRequired
    ? Math.round(numValue).toString()
    : numValue.toString();

  // 拼接单位
  return unit ? `${formattedValue}${unit}` : formattedValue;
};
export default DesktopQuoteItemsTable;
