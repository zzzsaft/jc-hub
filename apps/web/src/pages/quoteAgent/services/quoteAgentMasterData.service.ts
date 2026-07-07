import { apiClient } from "@/api/http/client";
import type {
  ProductMasterDataCandidate,
  ProductMasterDataSearchResponse,
  ProductMasterDataTermType,
  ProductModelBindingPayload,
} from "../types";
import {
  productMasterDataItems,
  productMasterDataSearchPath,
  slowRequest,
  unwrap,
} from "./quoteAgent.service.utils";

export const quoteAgentMasterDataService = {
  async searchProductMasterData(
    termType: ProductMasterDataTermType,
    model: string,
  ): Promise<ProductMasterDataCandidate[]> {
    const response = unwrap<ProductMasterDataSearchResponse>(
      await apiClient.get(productMasterDataSearchPath[termType], {
        params: { model },
        ...slowRequest,
      }),
    );
    return productMasterDataItems(response);
  },

  async bindProductModel(payload: ProductModelBindingPayload): Promise<unknown> {
    const { sourceTable, candidate, ...rest } = payload;
    return unwrap(
      await apiClient.post(
        "/productConfigAgent/master-data/model-binding",
        {
          ...rest,
          source: sourceTable,
          masterDataId: payload.masterDataId ?? candidate.id,
        },
        slowRequest,
      ),
    );
  },
};
