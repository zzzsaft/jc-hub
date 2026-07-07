import type { FieldDictionary, FieldQualifier } from "./field.types";

export type ContractArchiveStatus = "uploaded" | "normalized" | "archived";

export interface ContractSummary {
  uploadedCount: number;
  normalizedCount: number;
  archivedCount: number;
}

export interface ContractListItem {
  documentId: number;
  archiveId: number | null;
  extractionResultId: number | null;
  fileName: string;
  status: ContractArchiveStatus | string;
  productNumber?: string | null;
  contractNumber?: string | null;
  orderNumber?: string | null;
  customerId?: string | null;
  currentVersion?: number | null;
  updatedAt?: string | null;
  createdAt: string;
}

export interface ContractListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: ContractListItem[];
}

export interface ArchiveChange {
  path: string;
  value: unknown;
}

export interface ProductBinding {
  id?: number | string;
  productNumber: string;
  role?: "primary" | "component" | "spare_part" | "derived" | "unknown";
  quantity?: string | null;
  bindingSource?: "manual" | "erp" | "rule" | "document" | "inherited";
  confidence?: number | null;
  erpProductId?: string | null;
  erpParentProductNumber?: string | null;
  erpMatchStatus?: "unmatched" | "matched" | "ambiguous" | "manual";
  price?: {
    amount?: number | string | null;
    currency?: string | null;
    source?: "erp" | "quote_history" | "manual" | null;
  } | null;
  evidence?: unknown;
  note?: string | null;
}

export interface ProductBindingPayload {
  productNumber: string;
  role?: ProductBinding["role"];
  quantity?: string | null;
  bindingSource?: ProductBinding["bindingSource"];
  confidence?: number | null;
  erpProductId?: string | null;
  erpParentProductNumber?: string | null;
  erpMatchStatus?: ProductBinding["erpMatchStatus"];
  priceAmount?: string | number | null;
  priceCurrency?: string | null;
  priceSource?: "erp" | "quote_history" | "manual" | null;
  evidence?: unknown;
  note?: string | null;
}

export interface ArchiveItemField {
  field_name?: string;
  raw_value?: unknown;
  qualifier?: FieldQualifier;
  dictionary?: FieldDictionary;
  evidence?: unknown;
  confidence?: number | string | null;
  [key: string]: any;
}

export interface ArchiveItem {
  id: number;
  itemIndex: number;
  itemName?: string | null;
  itemQuantity?: string | null;
  productTypeHint?: string | null;
  productTypeRawValue?: string | null;
  productTypeDisplayName?: string | null;
  sourceProductNumber?: string | null;
  productNumberStatus?: string | null;
  fields?: ArchiveItemField[];
  warnings?: unknown[];
  productBindings?: ProductBinding[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ContractArchiveDetail {
  id: number;
  documentId: number;
  extractionResultId: number;
  fileName?: string | null;
  status?: string;
  productNumber?: string | null;
  contractNumber?: string | null;
  orderNumber?: string | null;
  customerId?: string | null;
  country?: string | null;
  orderDate?: string | null;
  deliveryDate?: string | null;
  docInfo?: Record<string, any>;
  currentVersion?: number;
  archivedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items?: ArchiveItem[];
}

export interface ContractArchiveVersion {
  id: number;
  archiveId: number;
  version: number;
  changeSummary?: unknown;
  snapshot?: ContractArchiveDetail;
  editedBy?: string | null;
  editReason?: string | null;
  createdAt?: string;
}

export interface ContractArchiveDetailResponse {
  archive: ContractArchiveDetail;
  latestVersion: ContractArchiveVersion | null;
  version?: ContractArchiveVersion;
}

export interface ContractArchiveReadinessIssue {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ContractArchiveReadinessResponse {
  documentId: number;
  extractionResultId: number | null;
  canArchive: boolean;
  forceRequired: boolean;
  blockers: ContractArchiveReadinessIssue[];
  warnings: ContractArchiveReadinessIssue[];
  summary: {
    itemCount: number;
    termTypeCandidateCount: number;
    valueCandidateCount: number;
    productNumber: string | null;
    docInfoSource: "normalized_extraction_json" | "llm_plan_json" | "none";
  };
}

export interface ContractArchiveVersionsResponse {
  versions: ContractArchiveVersion[];
}

export interface ContractArchiveVersionResponse {
  version: ContractArchiveVersion & {
    snapshot: ContractArchiveDetail;
  };
}

export interface ProductConfigMatch {
  archiveId: number;
  documentId: number;
  extractionResultId: number;
  fileName?: string | null;
  itemId: number;
  itemIndex: number;
  itemName?: string | null;
  itemProductTypeHint?: string | null;
  sourceProductNumber?: string | null;
  productBinding?: ProductBinding;
  customerId?: string | null;
  configFields?: ArchiveItemField[];
  price?: ProductBinding["price"];
  erpProduct?: {
    id?: string | null;
    productNumber?: string | null;
    parentProductNumber?: string | null;
  } | null;
  matchStatus?: "erp_matched" | "archive_only" | string;
}

export interface ProductConfigSearchResponse {
  productNumber: string;
  matches: ProductConfigMatch[];
}
