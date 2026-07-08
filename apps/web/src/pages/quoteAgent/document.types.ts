import type { DocumentStatus } from "./status.types";
import type { QuoteAgentField } from "./field.types";

export interface QuoteAgentDocument {
  id?: number | string;
  documentId?: number | string;
  extractionJobId?: string;
  extractionResultId?: number | string;
  status?: DocumentStatus | string;
  fileName?: string;
  filePath?: string;
  itemCount?: number;
  warningCount?: number;
  candidateCount?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DocumentListResponse {
  items?: QuoteAgentDocument[];
  documents?: QuoteAgentDocument[];
  data?: QuoteAgentDocument[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface DictionarySummary {
  item_count?: number;
  field_count?: number;
  matched_field_count?: number;
  unmatched_field_count?: number;
  candidate_count?: number;
  warning_count?: number;
  [key: string]: unknown;
}

export interface QuoteAgentItem {
  item_index?: number | string;
  item_quantity?: string;
  itemProductTypeHint?: string;
  itemProductTypeHintConfidence?: number | string;
  itemProductTypeHintRawValue?: string;
  fields?: QuoteAgentField[];
  warnings?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ExtractionDetail {
  document?: QuoteAgentDocument;
  extraction?: Record<string, unknown>;
  dictionary?: DictionarySummary | Record<string, unknown>;
  summary?: DictionarySummary;
  items?: QuoteAgentItem[];
  warnings?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
