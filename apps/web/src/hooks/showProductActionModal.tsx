import { useCallback } from "react";
import { modalStore } from "../store/modalStore";
import { useQuoteStore } from "../store/useQuoteStore";
import { QuoteItem } from "../types/types";

interface PartAddingProps {
  method: "add";
  quoteItems?: QuoteItem[];
  quoteId: number;
  productCategory: string[];
  productName: string;
  linkId: number;
  source: {
    name: string;
    value: boolean | string;
    key: string;
  };
}

interface PartDeletingProps {
  method: "delete";
  productCategory?: string[];
  quoteItems?: QuoteItem[];
  linkId: number;
  items: {
    itemId?: number;
    name: string;
    source?: {
      key: string;
      name: string;
      value: string | boolean;
    };
  }[];
  quoteId: number;
}

type PartActionProps = PartAddingProps | PartDeletingProps;

const useProductActionModal = () => {
  const { openModal, setIsLoading } = modalStore();
  const { addQuoteItem, deleteQuoteItem, updateQuoteItemConfig } = useQuoteStore();

  const findExistingItem = (p: PartActionProps) =>
    p.quoteItems?.find(
      (item) =>
        item.linkId === p.linkId &&
        item.productCategory?.at(-1) === p.productCategory?.at(-1)
    );

  const showProductActionModal = useCallback(
    (prop: PartActionProps): Promise<{ result: boolean; id?: number }> =>
      new Promise((resolve) => {
        const existing = findExistingItem(prop);

        if (
          (prop.method === "add" && existing) ||
          (prop.method === "delete" && prop.productCategory && !existing)
        ) {
          resolve({ result: true });
          return;
        }

        const deletingId = existing?.id;

        const handleAdd = async () => {
          const { quoteId, productCategory, productName, linkId, source } =
            prop as PartAddingProps;
          setIsLoading(true);
          const id = await addQuoteItem(quoteId, {
            productCategory,
            productName,
            linkId,
            source,
          });
          setIsLoading(false);
          resolve({ id, result: true });
        };

        const handleDelete = async () => {
          setIsLoading(true);
          for (const item of (prop as PartDeletingProps).items) {
            if (!item.itemId && !deletingId) continue;
            await deleteQuoteItem(prop.quoteId, item.itemId ?? deletingId!);

            if (item.source) {
              updateQuoteItemConfig(prop.quoteId, prop.linkId, {
                [item.source.key]: item.source.value,
              });
            }
          }
          setIsLoading(false);
          resolve({ result: true });
        };

        const modalContent =
          prop.method === "add" ? (
            <div>
              <p>您勾选了这个选项，点击确认后，会往产品列表中添加：</p>
              <p style={{ fontWeight: "bold", margin: "8px 0" }}>{prop.productName}</p>
              <p>添加后可在报价单中查看。</p>
            </div>
          ) : (
            <div>
              <p>以下产品将从产品列表中删去：</p>
              <ul
                style={{
                  margin: "8px 0",
                  paddingLeft: "16px",
                  listStyleType: "disc",
                }}
              >
                {(prop as PartDeletingProps).items.map((item) => (
                  <li key={item.itemId ?? `temp_${item.name}`} style={{ marginBottom: "4px" }}>
                    {item.name}
                    {item.source && (
                      <div style={{ marginTop: "4px", fontSize: "0.9em" }}>
                        产品配置表中 <strong>{item.source.name}</strong>{" "}
                        将会改为 <strong>{String(item.source.value)}</strong>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p style={{ color: "#ff4d4f" }}>删除后无法恢复，请确认！</p>
            </div>
          );

        openModal({
          title: prop.method === "add" ? "添加产品确认" : "删除产品确认",
          content: modalContent,
          onOk: prop.method === "add" ? handleAdd : handleDelete,
          onCancel: () => resolve({ result: false }),
        });
      }),
    [addQuoteItem, deleteQuoteItem, openModal, updateQuoteItemConfig]
  );

  return { showProductActionModal };
};

export default useProductActionModal;
