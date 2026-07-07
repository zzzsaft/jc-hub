import { isMobile } from "react-device-detect"; // 使用设备检测库
import { useQuoteStore } from "@/store/useQuoteStore";
import DesktopQuoteItemsTable from "./DesktopQuoteItemsTable";
import { QuoteItem } from "@/types/types";
import { App } from "@/components/ui/core";
import useProductActionModal from "@/hooks/showProductActionModal";
interface QuoteItemsTableProps {
  quoteId: number;
  id?: string;
}

const QuoteItemsTable: React.FC<QuoteItemsTableProps> = ({ quoteId, id }) => {
  const items = useQuoteStore(
    (state) => state.quotes.find((quote) => quote.id === quoteId)?.items
  );
  const { showProductActionModal } = useProductActionModal();

  const { modal } = App.useApp();
  const onRemoveItem = useQuoteStore((state) => state.deleteQuoteItem);

  const confirmDelete = async (record: QuoteItem) => {
    if (record.linkId) {
      const result = showProductActionModal({
        linkId: record.linkId,
        method: "delete",
        quoteId,
        items: [
          {
            name: record?.productName ?? "",
            itemId: record.id,
            source: record.source,
          },
        ],
      });
    } else if (record.productCategory && record.productCategory?.length != 0)
      modal.confirm({
        title: "确认删除",
        content: "确定要删除这个产品吗？",
        okText: "确定",
        cancelText: "取消",
        onOk: () => onRemoveItem(quoteId, record.id),
      });
    else {
      onRemoveItem(quoteId, record.id);
    }
  };

  return (
    <div id={id}>
      <DesktopQuoteItemsTable
        items={items ?? []}
        quoteId={quoteId}
        confirmDelete={confirmDelete}
      />
    </div>
  );
};

export default QuoteItemsTable;
