import { apiClient } from "@/api/http/client";
import type {
  DictionaryOptions,
  DictionaryTermType,
  DictionaryValue,
  ProductTypeOption,
  UnitAlias,
  UnitAliasPayload,
  UnitAliasesResponse,
} from "../types";
import {
  dictionaryTermTypeFromResponse,
  dictionaryValueFromResponse,
  slowRequest,
  unitAliasesFromResponse,
  unwrap,
} from "./quoteAgent.service.utils";

export const quoteAgentDictionaryService = {
  async getUnitAliases(): Promise<UnitAlias[]> {
    return unitAliasesFromResponse(
      unwrap(await apiClient.get<UnitAliasesResponse | UnitAlias[]>("/productConfigAgent/dictionary/unit-aliases", slowRequest)),
    );
  },

  async createUnitAlias(payload: UnitAliasPayload): Promise<UnitAlias> {
    const response = unwrap<UnitAlias | { alias: UnitAlias; unitAlias?: UnitAlias } | { unitAlias: UnitAlias }>(
      await apiClient.post("/productConfigAgent/dictionary/unit-aliases", payload, slowRequest),
    );
    if ("unitAlias" in response && response.unitAlias) return response.unitAlias;
    if ("alias" in response && response.alias) return response.alias;
    return response as UnitAlias;
  },

  async updateUnitAlias(id: string | number, payload: Partial<UnitAliasPayload>): Promise<UnitAlias> {
    const response = unwrap<UnitAlias | { alias: UnitAlias; unitAlias?: UnitAlias } | { unitAlias: UnitAlias }>(
      await apiClient.patch(
        `/productConfigAgent/dictionary/unit-aliases/${encodeURIComponent(String(id))}`,
        payload,
        slowRequest,
      ),
    );
    if ("unitAlias" in response && response.unitAlias) return response.unitAlias;
    if ("alias" in response && response.alias) return response.alias;
    return response as UnitAlias;
  },

  async getDictionaryOptions(): Promise<DictionaryOptions> {
    const [termTypesResponse, valuesResponse, productTypesResponse] = await Promise.all([
      apiClient.get<{ termTypes: DictionaryTermType[] }>("/productConfigAgent/dictionary/term-types", slowRequest),
      apiClient.get<{ values: DictionaryValue[] }>("/productConfigAgent/dictionary/values", slowRequest),
      apiClient.get<ProductTypeOption[] | { productTypes: ProductTypeOption[] }>(
        "/productConfigAgent/dictionary/product-types",
        slowRequest,
      ),
    ]);

    const productTypesData = productTypesResponse.data;
    return {
      termTypes: termTypesResponse.data.termTypes ?? [],
      values: valuesResponse.data.values ?? [],
      productTypes: Array.isArray(productTypesData)
        ? productTypesData
        : productTypesData.productTypes ?? [],
    };
  },

  async getDictionaryValues(params?: string | { termType?: string; qualifierPosition?: string; productType?: string }): Promise<DictionaryValue[]> {
    const termType = typeof params === "string" ? params : params?.termType;
    const response = await apiClient.get<{ values: DictionaryValue[] }>("/productConfigAgent/dictionary/values", {
      params: termType ? { termType } : undefined,
      ...slowRequest,
    });
    return response.data.values ?? [];
  },

  async createTermType(payload: Partial<DictionaryTermType>): Promise<DictionaryTermType> {
    return dictionaryTermTypeFromResponse(
      unwrap(await apiClient.post<DictionaryTermType | { termType: DictionaryTermType }>(
        "/productConfigAgent/dictionary/term-types",
        payload,
        slowRequest,
      )),
    );
  },

  async updateTermType(
    termTypeId: string | number,
    payload: Partial<DictionaryTermType>,
  ): Promise<DictionaryTermType> {
    return dictionaryTermTypeFromResponse(unwrap(
      await apiClient.patch(
        `/productConfigAgent/dictionary/term-types/${encodeURIComponent(String(termTypeId))}`,
        payload,
        slowRequest,
      ),
    ));
  },

  async createDictionaryValue(payload: Partial<DictionaryValue>): Promise<DictionaryValue> {
    return dictionaryValueFromResponse(
      unwrap(await apiClient.post<DictionaryValue | { value: DictionaryValue }>(
        "/productConfigAgent/dictionary/values",
        payload,
        slowRequest,
      )),
    );
  },

  async updateDictionaryValue(
    valueId: string | number,
    payload: Partial<DictionaryValue>,
  ): Promise<DictionaryValue> {
    return dictionaryValueFromResponse(unwrap(
      await apiClient.patch(
        `/productConfigAgent/dictionary/values/${encodeURIComponent(String(valueId))}`,
        payload,
        slowRequest,
      ),
    ));
  },

  async deleteDictionaryValue(valueId: string | number): Promise<unknown> {
    return unwrap(
      await apiClient.delete(
        `/productConfigAgent/dictionary/values/${encodeURIComponent(String(valueId))}`,
        slowRequest,
      ),
    );
  },
};
