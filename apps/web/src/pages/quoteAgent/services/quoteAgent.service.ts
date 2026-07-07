import { apiClient } from "@/api/http/client";
import type {
  BatchReviewOptions,
  BatchReviewResponse,
  CandidateClusterFilters,
  CandidateClusterReviewPromptResponse,
  CandidateClustersResponse,
  CandidateStatus,
  CandidatesResponse,
  ContractArchiveDetailResponse,
  ContractArchiveReadinessResponse,
  ContractArchiveVersionResponse,
  ContractArchiveVersionsResponse,
  ContractListResponse,
  ContractSummary,
  DictionaryOptions,
  DictionaryTermType,
  DictionaryValue,
  DocumentListResponse,
  ExtractionDetail,
  PendingLlmUploadJob,
  ProductMasterDataCandidate,
  ProductMasterDataSearchResponse,
  ProductMasterDataTermType,
  ProductModelBindingPayload,
  ProductBindingPayload,
  ProductConfigSearchResponse,
  ProductTypeOption,
  RenormalizeBatchParams,
  RenormalizeBatchResponse,
  ReviewOperation,
  SplitTermTypeCandidatePayload,
  UnitAlias,
  UnitAliasPayload,
  UnitAliasesResponse,
  UnitCandidate,
  UnitCandidateReviewPromptResponse,
  UnitCandidatesResponse,
} from "../types";

const unwrap = <T>(response: { data: T }) => response.data;
const slowRequest = { timeout: 120000 };
const defaultReviewer = "Codex";
const productMasterDataSearchPath: Record<ProductMasterDataTermType, string> = {
  metering_pump_model: "/product/pump/get",
  filter_model: "/product/filter/get",
};

const withReviewer = (operation: ReviewOperation): ReviewOperation => ({
  ...operation,
  payload: {
    reviewedBy: defaultReviewer,
    ...operation.payload,
  },
});

const productMasterDataItems = (response: ProductMasterDataSearchResponse | ProductMasterDataCandidate[] | unknown): ProductMasterDataCandidate[] => {
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

const dictionaryTermTypeFromResponse = (response: DictionaryTermType | { termType: DictionaryTermType }) =>
  "termType" in response && typeof response.termType === "object" && response.termType !== null
    ? response.termType
    : response as DictionaryTermType;

const dictionaryValueFromResponse = (response: DictionaryValue | { value: DictionaryValue }) =>
  "value" in response && typeof response.value === "object" && response.value !== null
    ? response.value
    : response as DictionaryValue;

const unitAliasesFromResponse = (response: UnitAliasesResponse | UnitAlias[] | unknown): UnitAlias[] => {
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

const unitCandidatesFromResponse = (response: UnitCandidatesResponse | UnitCandidate[] | unknown): UnitCandidate[] => {
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

export const quoteAgentService = {
  async getContractSummary(): Promise<ContractSummary> {
    return unwrap(await apiClient.get("/productConfigAgent/contracts/summary", slowRequest));
  },

  async listContracts(params: {
    page?: number;
    pageSize?: number;
    status?: "uploaded" | "normalized" | "archived" | "";
    q?: string;
    productNumber?: string;
    customerId?: string;
  }): Promise<ContractListResponse> {
    const { status, ...rest } = params;
    return unwrap(
      await apiClient.get("/productConfigAgent/contracts", {
        params: {
          ...rest,
          status: status || undefined,
        },
        ...slowRequest,
      }),
    );
  },

  async uploadContract(file: File): Promise<ExtractionDetail> {
    const formData = new FormData();
    formData.append("file", file);
    return unwrap(
      await apiClient.post("/productConfigAgent/contracts/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      }),
    );
  },

  async listDocuments(params: {
    page: number;
    pageSize: number;
    status?: string;
    q?: string;
  }): Promise<DocumentListResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/extractions", { params, ...slowRequest }));
  },

  async getExtraction(documentId: string | number): Promise<ExtractionDetail> {
    return unwrap(await apiClient.get(`/productConfigAgent/extractions/${documentId}`, slowRequest));
  },

  async getContract(documentId: string | number): Promise<ExtractionDetail> {
    return unwrap(await apiClient.get(`/productConfigAgent/contracts/${documentId}`, slowRequest));
  },

  async archiveContract(
    documentId: string | number,
    body: { archivedBy?: string; reviewedBy?: string; force?: boolean } = {},
  ): Promise<ContractArchiveDetailResponse> {
    return unwrap(await apiClient.post(`/productConfigAgent/contracts/${documentId}/archive`, body, slowRequest));
  },

  async getContractArchiveReadiness(documentId: string | number): Promise<ContractArchiveReadinessResponse> {
    return unwrap(await apiClient.get(`/productConfigAgent/contracts/${documentId}/archive-readiness`, slowRequest));
  },

  async getContractArchive(archiveId: string | number): Promise<ContractArchiveDetailResponse> {
    return unwrap(await apiClient.get(`/productConfigAgent/contract-archives/${archiveId}`, slowRequest));
  },

  async updateContractArchive(
    archiveId: string | number,
    body: {
      editedBy?: string;
      changes: Array<{ path: string; value: unknown }>;
    },
  ): Promise<ContractArchiveDetailResponse> {
    return unwrap(await apiClient.patch(`/productConfigAgent/contract-archives/${archiveId}`, body, slowRequest));
  },

  async listContractArchiveVersions(
    archiveId: string | number,
  ): Promise<ContractArchiveVersionsResponse> {
    return unwrap(await apiClient.get(`/productConfigAgent/contract-archives/${archiveId}/versions`, slowRequest));
  },

  async getContractArchiveVersion(
    archiveId: string | number,
    version: string | number,
  ): Promise<ContractArchiveVersionResponse> {
    return unwrap(await apiClient.get(`/productConfigAgent/contract-archives/${archiveId}/versions/${version}`, slowRequest));
  },

  async updateItemProductBindings(
    archiveId: string | number,
    itemId: string | number,
    body: {
      editedBy?: string;
      bindings: ProductBindingPayload[];
    },
  ): Promise<ContractArchiveDetailResponse> {
    return unwrap(
      await apiClient.put(
        `/productConfigAgent/contract-archives/${archiveId}/items/${itemId}/product-bindings`,
        body,
        slowRequest,
      ),
    );
  },

  async searchProductConfigs(params: {
    productNumber: string;
    customerId?: string;
    includeErp?: boolean;
  }): Promise<ProductConfigSearchResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/product-configs/search", { params, ...slowRequest }));
  },

  async renormalize(documentId: string | number): Promise<ExtractionDetail> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/extractions/${documentId}/renormalize`, undefined, slowRequest),
    );
  },

  async renormalizeBatch(params: RenormalizeBatchParams): Promise<RenormalizeBatchResponse> {
    return unwrap(await apiClient.post("/productConfigAgent/extractions/renormalize-batch", params, slowRequest));
  },

  async reextract(documentId: string | number, params?: { llmModel?: string }): Promise<ExtractionDetail> {
    return unwrap(await apiClient.post(`/productConfigAgent/extractions/${documentId}/reextract`, params ?? {}, slowRequest));
  },

  async openDocumentFile(documentId: string | number): Promise<Record<string, unknown>> {
    return unwrap(await apiClient.post(`/productConfigAgent/documents/${documentId}/open-file`));
  },

  async startPendingLlmUpload(params?: {
    limit?: number;
    llmModel?: string;
    concurrency?: number;
  }): Promise<{ job: PendingLlmUploadJob }> {
    return unwrap(await apiClient.post("/productConfigAgent/documents/pending-llm-upload/start", params ?? {}, slowRequest));
  },

  async getPendingLlmUploadStatus(): Promise<{ job: PendingLlmUploadJob | null }> {
    return unwrap(await apiClient.get("/productConfigAgent/documents/pending-llm-upload/status"));
  },

  async getCandidates(params: {
    status: CandidateStatus;
    documentId?: string | number;
    recheckPendingCandidates?: boolean;
  }): Promise<CandidatesResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates", { params, ...slowRequest }));
  },

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

  async getUnitCandidates(params: { status: CandidateStatus }): Promise<UnitCandidate[]> {
    return unitCandidatesFromResponse(
      unwrap(
        await apiClient.get<UnitCandidatesResponse | UnitCandidate[]>("/productConfigAgent/candidates/units", {
          params,
          ...slowRequest,
        }),
      ),
    );
  },

  async approveUnitCandidate(candidateId: string | number, payload: UnitAliasPayload): Promise<unknown> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/candidates/units/${encodeURIComponent(String(candidateId))}/approve`,
        payload,
        slowRequest,
      ),
    );
  },

  async rejectUnitCandidate(
    candidateId: string | number,
    payload: { reason?: string; reviewedBy?: string } = { reviewedBy: defaultReviewer },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(
        `/productConfigAgent/candidates/units/${encodeURIComponent(String(candidateId))}/reject`,
        payload,
        slowRequest,
      ),
    );
  },

  async getUnitCandidateReviewPrompt(): Promise<UnitCandidateReviewPromptResponse | string> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/units/review-prompt", slowRequest));
  },

  async getCandidateClusterReviewPrompt(): Promise<CandidateClusterReviewPromptResponse | string> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/clusters/review-prompt", slowRequest));
  },

  async getCandidateClusters(params: CandidateClusterFilters): Promise<CandidateClustersResponse> {
    return unwrap(await apiClient.get("/productConfigAgent/candidates/clusters", { params, ...slowRequest }));
  },

  async suggestCandidateClusterReviewsBatch(params: {
    clusterIds?: Array<string | number>;
    status?: CandidateStatus;
    model?: string;
    priorDecisions?: unknown[];
    runPolicy?: Record<string, unknown>;
  }): Promise<unknown> {
    return unwrap(await apiClient.post("/productConfigAgent/candidates/clusters/suggestions/batch", params, slowRequest));
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

  async suggestTermTypeCandidate(
    candidateId: string | number,
    params?: { model?: string; force?: boolean },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/term-type/${candidateId}/suggest`, params ?? {}, slowRequest),
    );
  },

  async splitTermTypeCandidate(
    candidateId: string | number,
    payload: SplitTermTypeCandidatePayload,
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/term-type/${candidateId}/split`, payload, slowRequest),
    );
  },

  async suggestValueSplit(
    candidateId: string | number,
    params?: { model?: string; force?: boolean },
  ): Promise<unknown> {
    return unwrap(
      await apiClient.post(`/productConfigAgent/candidates/value/${candidateId}/split-suggest`, params ?? {}, slowRequest),
    );
  },

  async suggestCandidateReviewsBatch(params: {
    status?: CandidateStatus;
    documentId?: string | number;
    model?: string;
    force?: boolean;
  }): Promise<unknown> {
    return unwrap(await apiClient.post("/productConfigAgent/candidates/suggestions/batch", params, slowRequest));
  },

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

  async submitReview(operation: ReviewOperation): Promise<unknown> {
    return this.submitBatchReviews([operation]);
  },

  async submitBatchReviews(
    operations: ReviewOperation[],
    options: BatchReviewOptions = { deferCandidateRecheck: true },
  ): Promise<BatchReviewResponse> {
    return unwrap(
      await apiClient.post("/productConfigAgent/candidates/reviews/batch", {
        ...options,
        operations: operations.map(withReviewer),
      }, slowRequest),
    );
  },
};
