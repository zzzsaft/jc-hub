import { apiClient } from "../http/client";

export const OrderService = {
  async getOrderInfo(orderId: string) {
    const res = await apiClient.get("/order/get", { params: { orderId } });
    const data = res.data as any;
    return {
      ...data,
      items: data.items ?? [],
    } as {
      items: { productCode: string; name: string }[];
    } & typeof data;
  },
};
