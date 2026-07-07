import type {
  DictionaryTermType,
  DictionaryValue,
  ProductMasterDataCandidate,
  ProductMasterDataSearchResponse,
  ProductMasterDataTermType,
  ReviewOperation,
  UnitAlias,
  UnitAliasesResponse,
  UnitCandidate,
  UnitCandidatesResponse,
} from "../types";

export const unwrap = <T>(response: { data: T }) => response.data;
export const slowRequest = { timeout: 120000 };
export const defaultReviewer = "Codex";

export const productMasterDataSearchPath: Record<ProductMasterDataTermType, string> = {
  metering_pump_model: "/product/pump/get",
  filter_model: "/product/filter/get",
};

export const withReviewer = (operation: ReviewOperation): ReviewOperation => ({
  ...operation,
  payload: {
    reviewedBy: defaultReviewer,
    ...operation.payload,
  },
});

export const productMasterDataItems = (response: ProductMasterDataSearchResponse | ProductMasterDataCandidate[] | unknown): ProductMasterDataCandidate[] => {
  if (Array.isArray(response)) return response as ProductMasterDataCandidate[];
  const value = response as ProductMasterDataSearchResponse & { candidates?: ProductMasterDataCandidate[] };
  if (Array.isArray(value?.candidates)) return value.candidates;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.results)) return value.data.results;
  return [];
};

export const dictionaryTermTypeFromResponse = (response: DictionaryTermType | { termType: DictionaryTermType }) =>
  "termType" in response && typeof response.termType === "object" && response.termType !== null
    ? response.termType
    : response as DictionaryTermType;

export const dictionaryValueFromResponse = (response: DictionaryValue | { value: DictionaryValue }) =>
  "value" in response && typeof response.value === "object" && response.value !== null
    ? response.value
    : response as DictionaryValue;

export const unitAliasesFromResponse = (response: UnitAliasesResponse | UnitAlias[] | unknown): UnitAlias[] => {
  if (Array.isArray(response)) return response;
  const value = response as UnitAliasesResponse;
  if (Array.isArray(value?.aliases)) return value.aliases;
  if (Array.isArray(value?.unitAliases)) return value.unitAliases;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (value?.data && !Array.isArray(value.data)) {
    if (Array.isArray(value.data.aliases)) return value.data.aliases;
    if (Array.isArray(value.data.items)) return value.data.items;
  }
  return [];
};

export const unitCandidatesFromResponse = (response: UnitCandidatesResponse | UnitCandidate[] | unknown): UnitCandidate[] => {
  if (Array.isArray(response)) return response;
  const value = response as UnitCandidatesResponse;
  if (Array.isArray(value?.candidates)) return value.candidates;
  if (Array.isArray(value?.unitCandidates)) return value.unitCandidates;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (value?.data && !Array.isArray(value.data)) {
    if (Array.isArray(value.data.candidates)) return value.data.candidates;
    if (Array.isArray(value.data.items)) return value.data.items;
  }
  return [];
};
