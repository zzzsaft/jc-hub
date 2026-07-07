// store/useQuoteStore.ts
import { create } from "zustand";
import { OpportunityService } from "../api/services/opportunity.service";
import { ProductCategory, Quote, QuoteItem } from "../types/types";
import { getFormType } from "../components/quote/productConfigForm/formType";
import { immer } from "zustand/middleware/immer";
import { QuoteService } from "../api/services/quote.service";

export interface Customer {
  id: string;
  name: string;
  charger?: string;
  collaborator?: string[];
}

export interface Contact {
  name: string;
  phone?: string;
}
export interface Opportunity {
  customer: Customer;
  id: string;
  name: string;
  latestQuoteStatus: "none" | "quoting" | "reviewing" | "completed";
  quoteCount: number;
  charger: string;
  chargerId: string;
  createdAt: string;
  lastQuoteDate?: string;
  products: ProductInfo[];
}
export interface ProductInfo {
  productName: string;
  productCategory: string[];
  price: number;
  quantity: number;
}
export interface Product {
  id: string;
  name: string;
  category: string[];
  basePrice: number;
  configSchema?: any; // JSON Schema for product configuration
}

interface QuotesStore {
  quotes: Quote[];
  total: number;
  loading: {
    add: boolean;
    delete: boolean;
    getQuotes: boolean;
    getQuote: boolean;
    saveQuote: boolean;
  };
  categories: ProductCategory[];
  configModalVisible: boolean;
  setConfigModalVisible: (bool: boolean) => void;
  initialize: () => Promise<void>;
  fetchQuotes: (params: {
    page?: number;
    pageSize?: number;
    type?: string;
    quoteName?: string;
    customerName?: string;
    status?: string;
    approvalNode?: string;
    currentApprover?: string;
    sorters?: { field: string; order: string }[];
  }) => Promise<void>;
  fetchQuote: (quoteId: number) => Promise<Quote>;
  createQuote: (params: {
    customerName: string;
    customerId: string;
    quoteId?: string;
    orderId?: string;
    date: Date;
    chargerId: string;
    projectManagerId: string;
    quoteName: string;
    contactName?: string;
    contactPhone?: string;
    remark?: string;
    senderId?: string;
    senderPhone?: string;
    items?: Partial<QuoteItem>[];
  }) => Promise<Quote>;
  updateQuote: (
    quoteId: number,
    updateData: Partial<Omit<Quote, "items">>
  ) => void;
  addQuoteItem: (quoteId: number, item?: Partial<QuoteItem>) => Promise<number>;
  // addChildQuoteItem: (
  //   quoteId: number,
  //   parentId: number,
  //   item: Partial<QuoteItem>
  // ) => Promise<number>;
  deleteQuoteItem: (quoteId: number, itemId: number) => Promise<void>;
  updateQuoteItem: (
    quoteId: number,
    itemId: number | null,
    updateData: Partial<QuoteItem>
  ) => void;
  updateQuoteItemConfig: (
    quoteId: number,
    itemId: number | null,
    updateConfig: any
  ) => void;
  setQuoteItem: (quoteId: number, items: QuoteItem[]) => void;
  saveQuote: (quoteId: number, submit?: boolean) => Promise<void>;
  fetchPrintUrls: (quoteId: number) => Promise<void>;
  findItemById: (
    items: QuoteItem[],
    itemId: number | null
  ) => QuoteItem | undefined;
  findItemParent: (
    items: QuoteItem[],
    itemId: number | null
  ) => { parent: QuoteItem | undefined; index: number } | undefined;
  calculateItemPrice: (item: QuoteItem) => void;
  dirtyQuotes: Record<number, boolean>;
  isQuoteDirty: (quoteId: number) => boolean;
  discardQuoteChanges: (quoteId: number) => void;
  // calculateQuoteTotal: (quoteId: number) => void;
}

export const useQuoteStore = create<QuotesStore>()(
  immer((set, get) => ({
    quotes: [],
    total: 0,
    categories: [],
    dirtyQuotes: {},
    loading: {
      add: false,
      delete: false,
      getQuotes: false,
      getQuote: false,
      saveQuote: false,
    },
    configModalVisible: false,

    setConfigModalVisible: (bool) => {
      set({ configModalVisible: bool });
    },

    isQuoteDirty: (quoteId) => {
      return !!get().dirtyQuotes[quoteId];
    },

    discardQuoteChanges: (quoteId) => {
      set((state) => {
        state.dirtyQuotes[quoteId] = false;
      });
    },

    initialize: async () => {
      const categories = await OpportunityService.getProductCategory();
      set({ categories });
    },

    fetchQuotes: async (params) => {
      set({ loading: { ...get().loading, getQuotes: true } });
      const { list, total } = await QuoteService.getQuotes(params);
      set({ quotes: list, total });
      set({ loading: { ...get().loading, getQuotes: false } });
    },

    // 在 store 中保持原始函数
    fetchQuote: async (quoteId) => {
      try {
        set({ loading: { ...get().loading, getQuote: true } });
        const newQuote = await QuoteService.getQuote(quoteId);
        let needSave = false;
        newQuote.items.forEach((item: QuoteItem) => {
          const type = getFormType(item.productCategory || undefined);
          if (item.formType !== type) {
            item.formType = type;
            needSave = true;
          }
        });
        set((state) => {
          const existingIndex = state.quotes.findIndex(
            (q) => q.id === newQuote.id
          );
          if (existingIndex >= 0) {
            state.quotes[existingIndex] = newQuote;
          } else {
            state.quotes.push(newQuote);
          }
          state.dirtyQuotes[newQuote.id] = needSave;
        });
        if (needSave) {
          await QuoteService.updateQuoteItem(newQuote);
          set((state) => {
            state.dirtyQuotes[newQuote.id] = false;
          });
        }
        set((state) => {
          state.loading.getQuote = false;
        });
        return newQuote;
      } catch (error) {
        set({ loading: { ...get().loading, getQuote: false } });
        throw error;
      }
    }, // 300ms 后执行，如果期间有新触发则重新计时
    createQuote: async (params) => {
      const quote = await QuoteService.createQuote({
        ...params,
        type: "history",
        status: "draft",
      });
      if (!quote.items) {
        quote.items = [];
      }
      set((state) => {
        state.quotes.push(quote);
      });
      return quote;
    },

    updateQuote: async (quoteId, updateData) => {
      set((state) => {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote) {
          Object.assign(quote, updateData);
          if (updateData.discountAmount != null) {
            calculateQuoteTotal(quote);
          }
          state.dirtyQuotes[quoteId] = true;
        }
      });
    },

    addQuoteItem: async (quoteId, item) => {
      try {
        set({ loading: { ...get().loading, add: true } });
        // 1. 获取当前 quote 和 items 长度
        const state = get();
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (!quote) throw new Error(`Quote ${quoteId} not found`);

        const currentLength = quote.items ? quote.items.length : 0;
        if (!quote.items) {
          quote.items = [];
        }

        // 2. 调用 API 创建新 item
        const quoteItem: QuoteItem = await QuoteService.createQuoteItem(
          quoteId,
          null,
          {
            ...item,
            index: currentLength + 1, // 初始索引
          }
        );

        // 3. 使用 Immer 更新状态
        set((state) => {
          const quote = state.quotes.find((q) => q.id === quoteId);
          if (!quote) return state;

          // 查找目标位置（假设用 linkId 匹配）
          const targetIndex = quote.items.findIndex(
            (i) => i.id === quoteItem.linkId
          );

          // 插入或追加
          if (targetIndex !== -1) {
            quote.items.splice(targetIndex + 1, 0, {
              ...quoteItem,
              index: targetIndex + 2, // 直接计算新 index
            });
            // 仅更新后续元素的 index（避免全量遍历）
            for (let i = targetIndex + 2; i < quote.items.length; i++) {
              quote.items[i].index = i + 1;
            }
          } else {
            quote.items.push({
              ...quoteItem,
              index: currentLength + 1,
            });
          }

          state.loading.add = false;
          state.dirtyQuotes[quoteId] = true;
        });

        return quoteItem.id;
      } catch (error) {
        set({ loading: { ...get().loading, add: false } });

        throw error; // 抛出错误供调用方处理
      }
    },

    // addChildQuoteItem: async (quoteId, parentId, item) => {
    //   const state = get();
    //   const quote = state.quotes.find((q) => q.id === quoteId);
    //   if (!quote) throw new Error(`Quote ${quoteId} not found`);
    //   const currentLength = quote.items.length;
    //   const quoteItem = await QuoteService.createQuoteItem(quoteId, parentId, {
    //     ...item,
    //     index: currentLength + 1, // 初始索引
    //   });
    //   set((state) => {
    //     const quote = state.quotes.find((q) => q.id === quoteId);
    //     if (quote) {
    //       const parentItem = get().findItemById(quote.items, parentId);
    //       if (parentItem) {
    //         if (!parentItem.children) {
    //           parentItem.children = [];
    //         }
    //         parentItem.children.push(quoteItem);
    //       }
    //       state.dirtyQuotes[quoteId] = true;
    //     }
    //   });
    //   return quoteItem.id;
    // },

    deleteQuoteItem: async (quoteId, itemId) => {
      await QuoteService.deleteQuoteItem(itemId);
      set((state) => {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote) {
          // First try to find in top-level items
          const index = quote.items.findIndex((item) => item.id === itemId);
          if (index !== -1) {
            quote.items.splice(index, 1);
            calculateQuoteTotal(quote);
            return;
          }

          // If not found in top-level, search in children
          const parentInfo = get().findItemParent(quote.items, itemId);
          // if (parentInfo && parentInfo.parent?.children) {
          //   parentInfo.parent.children.splice(parentInfo.index, 1);
          //   calculateQuoteTotal(quote);
          // }
          state.dirtyQuotes[quoteId] = true;
        }
      });
    },

    updateQuoteItem: (quoteId, itemId, updateData) => {
      set((state) => {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote) {
          const item = get().findItemById(quote.items, itemId);
          if (item) {
            Object.assign(item, updateData);
            get().calculateItemPrice(item);
            calculateQuoteTotal(quote);
          }
          state.dirtyQuotes[quoteId] = true;
        }
      });
    },
    updateQuoteItemConfig: (quoteId, itemId, updateData) => {
      set((state) => {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote) {
          const item = get().findItemById(quote.items, itemId);
          if (item) {
            item.config = { ...(item.config ?? []), ...updateData };
          }
          state.dirtyQuotes[quoteId] = true;
        }
      });
    },
    setQuoteItem: (quoteId: number, items: QuoteItem[]) => {
      set((state) => {
        const quote = state.quotes.find((q) => q.id === quoteId);
        if (quote?.items) {
          quote.items = items;
          state.dirtyQuotes[quoteId] = true;
        }
      });
    },
    // Helper function to find item by ID (searches recursively in children)
    findItemById: (items, itemId) => {
      if (!Array.isArray(items)) return undefined;
      for (const item of items) {
        if (item.id === itemId) return item;
        // if (item.children) {
        //   const found = get().findItemById(item.children, itemId);
        //   if (found) return found;
        // }
      }
      return undefined;
    },

    // Helper function to find parent of an item
    findItemParent: (items, itemId) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // if (item.children) {
        //   const childIndex = item.children.findIndex(
        //     (child) => child.id === itemId
        //   );
        //   if (childIndex !== -1) {
        //     return { parent: item, index: childIndex };
        //   }

        //   const foundInChildren = get().findItemParent(item.children, itemId);
        //   if (foundInChildren) return foundInChildren;
        // }
      }
      return undefined;
    },

    saveQuote: async (quoteId, submit = false) => {
      set({ loading: { ...get().loading, saveQuote: true } });
      const quote = get().quotes.find((quote) => quoteId == quote.id);
      if (quote) {
        await QuoteService.updateQuoteItem(quote, submit);
        set((state) => {
          state.dirtyQuotes[quoteId] = false;
        });
      }
      set({ loading: { ...get().loading, saveQuote: false } });
    },

    fetchPrintUrls: async (quoteId) => {
      const quote = get().quotes.find((q) => q.id === quoteId);
      if (!quote) return;
      if (
        !get().dirtyQuotes[quoteId] &&
        quote.quotationPdf &&
        quote.contractPdf &&
        quote.configPdf
      ) {
        return;
      }
      await get().saveQuote(quoteId);
      // const data = await QuoteService.executePrint(quote);
      set((state) => {
        const q = state.quotes.find((i) => i.id === quoteId);
        // if (q) {
        //   q.quotationPdf = data.quotationPdf;
        //   q.contractPdf = data.contractPdf;
        //   q.configPdf = data.configPdf;
        // }
      });
    },

    // 计算单个QuoteItem的价格
    calculateItemPrice: (item) => {
      if (item.unitPrice !== null && item.quantity !== null) {
        const basePrice = item.unitPrice * item.quantity;
        item.subtotal = (basePrice * (item.discountRate ?? 0)) / 100;
      }
    },
  }))
);
(window as any).store = useQuoteStore;
function calculateQuoteTotal(quote: Quote) {
  if (!quote) return;

  let totalProductPrice = 0;
  quote.items.forEach((item) => {
    if (item.subtotal !== null) {
      totalProductPrice += parseFloat(item.subtotal as any);
    }
  });

  quote.totalProductPrice = totalProductPrice || 0;
  quote.quoteAmount = totalProductPrice - (quote.discountAmount || 0);
}
