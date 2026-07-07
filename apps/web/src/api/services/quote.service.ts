// import type { LoginParams, UserInfo } from '../types/auth.d';
import { apiClient } from "../http/client";
import { Quote, QuoteItem } from "@/types/types";

export const QuoteService = {
  async createQuote(params: {
    customerName: string;
    customerId: string;
    quoteId?: string;
    date: Date;
    type: string;
    status: string;
    orderId?: string;
    chargerId: string;
    projectManagerId: string;
    quoteName: string;
    contactName?: string;
    contactPhone?: string;
    remark?: string;
    senderId?: string;
    senderPhone?: string;
    items?: Partial<QuoteItem>[];
  }) {
    const quote = await apiClient.post("/quote/create", {
      ...params,
      quoteValidDays: 30,
    });
    return quote.data;
  },
  async createQuoteItem(
    quoteId: number,
    parentId?: number | null,
    params?: Partial<QuoteItem>
  ) {
    const quote = await apiClient.post("/quoteItem/create", {
      quoteId,
      parentId,
      params: {
        ...params,
        discountRate: 100,
      },
    });
    return quote.data;
  },
  async deleteQuoteItem(quoteItemId: number) {
    const quote = await apiClient.delete("/quoteItem/delete", {
      params: { quoteItemId },
    });
    return quote.data;
  },
  async updateQuoteItem(quote: Quote, submit = false) {
    const result = await apiClient.post("/quote/update", {
      quote,
      submit,
    });
    return result.data;
  },
  async getQuotes(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    quoteName?: string;
    customerName?: string;
    status?: string;
    approvalNode?: string;
    currentApprover?: string;
    sorters?: { field: string; order: string }[];
  }) {
    const { sorters, ...rest } = params || {};
    const sortParam = sorters?.map((s) => `${s.field}:${s.order}`).join(",");
    const quote = await apiClient.get("/quote/get", {
      params: { ...rest, sort: sortParam },
    });
    return quote.data as { list: Quote[]; total: number };
  },
  async getQuote(quoteId: number) {
    const quote = await apiClient.get("/quote/detail/get", {
      params: { quoteId },
    });
    return quote.data;
  },
  async executePrint(quote: Quote) {
    const result = await apiClient.post("/contract/execute", { ...quote });
    const data = result.data as {
      productQuotation: string;
      productPurchase: string;
      productConfiguration: string;
    };
    return {
      quotationPdf: data.productQuotation,
      contractPdf: data.productPurchase,
      configPdf: data.productConfiguration,
    };
  },

  async print(type: "config" | "quotation" | "contract", id: number) {
    const res = await apiClient.get(`/quote/${type}/print`, {
      params: { id },
      responseType: "blob",
    });
    return res.data as Blob;
  },

  async createShareLink(
    quoteItemId: number,
    expiresAt: Date,
    editable = false
  ) {
    const res = await apiClient.post("/quoteItem/share", {
      quoteItemId,
      expiresAt,
      editable,
    });
    return res.data as { uuid: string; pwd: string };
  },

  async getShare(uuid: string, pwd: string) {
    const res = await apiClient.get("/quoteItem/share/detail", {
      params: { uuid, pwd },
    });
    return res.data as {
      quoteItem: QuoteItem;
      quoteId: number;
      editable: boolean;
      shareUserId: string;
      shareUserName: string;
    };
  },

  async getShareLinks(quoteItemId: number) {
    const res = await apiClient.get("/quoteItem/share", {
      params: { quoteItemId },
    });
    return res.data as
      | undefined
      | {
          viewUuid: string;
          viewPwd: string;
          editUuid: string;
          editPwd: string;
          expiresAt?: string;
        };
  },

  async disableShare(quoteItemId: number) {
    const res = await apiClient.post("/quoteItem/share/disable", {
      quoteItemId,
    });
    return res.data;
  },

  async updateExpire(uuid: string, expiresAt: Date) {
    const res = await apiClient.post("/quoteItem/share/update", {
      uuid,
      expiresAt,
    });
    return res.data;
  },
  async saveShare(
    uuid: string,
    shareUserId: string,
    quoteItem: Partial<QuoteItem>
  ) {
    const res = await apiClient.post("/quoteItem/share/save", {
      uuid,
      shareUserId,
      quoteItem,
    });
    return res.data;
  },
};
