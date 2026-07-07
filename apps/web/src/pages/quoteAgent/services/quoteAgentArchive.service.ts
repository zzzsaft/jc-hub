import { apiClient } from "@/api/http/client";
import type {
  ContractArchiveDetailResponse,
  ContractArchiveReadinessResponse,
  ContractArchiveVersionResponse,
  ContractArchiveVersionsResponse,
  ContractListResponse,
  ContractSummary,
  DocumentListResponse,
  ExtractionDetail,
  PendingLlmUploadJob,
  ProductBindingPayload,
  ProductConfigSearchResponse,
  RenormalizeBatchParams,
  RenormalizeBatchResponse,
} from "../types";
import { slowRequest, unwrap } from "./quoteAgent.service.utils";

export const quoteAgentArchiveService = {
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
};
