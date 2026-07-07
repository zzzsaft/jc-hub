export type DocumentStatus =
  | "uploaded"
  | "parsed_blocks"
  | "extracted"
  | "normalized"
  | "dictionary_dirty"
  | "failed";

export type CandidateStatus = "pending" | "approved" | "rejected";
export type CandidateType = "term_type" | "value";

export type ReviewAction =
  | "create_term_type"
  | "approve_term_type_as_alias"
  | "split_term_type"
  | "create_value"
  | "approve_value_as_alias"
  | "split_value"
  | "move_value_to_other_term_type"
  | "update_term_type_value_kind"
  | "reject";

export interface ReviewOperation {
  candidateType: CandidateType;
  candidateId: string;
  action: ReviewAction;
  payload: Record<string, unknown>;
}

export interface BatchReviewOptions {
  refreshAffectedDocuments?: boolean;
  deferCandidateRecheck?: boolean;
}

export interface BatchReviewResponse {
  successCount?: number;
  failedCount?: number;
  affectedDocumentIds?: Array<string | number>;
  candidateRecheckDeferred?: boolean;
  failures?: Array<Record<string, any>>;
  failedOperations?: Array<Record<string, any>>;
  results?: Array<Record<string, any>>;
  [key: string]: unknown;
}

export interface TermTypeSplitItem {
  termType: string;
  displayName?: string;
  valueKind?: string;
  rawValue?: string;
  aliasNames?: string[];
  canonicalValue?: string;
}

export interface SplitTermTypeCandidatePayload {
  refreshAffectedDocuments?: boolean;
  splits: TermTypeSplitItem[];
}

export type RenormalizeBatchScope = "all" | "missing_normalized" | "with_pending_candidates";

export interface RenormalizeBatchParams {
  scope: RenormalizeBatchScope;
  limit?: number;
  batchSize?: number;
}

export interface RenormalizeBatchResponse {
  scope?: RenormalizeBatchScope;
  requestedLimit?: number | null;
  batchSize?: number;
  onlyMissingNormalized?: boolean;
  withPendingCandidates?: boolean;
  processedCount?: number;
  successCount?: number;
  failedCount?: number;
  failedResults?: Array<Record<string, any>>;
  resultPreview?: Array<Record<string, any>>;
  [key: string]: unknown;
}

export interface ReviewDraft extends ReviewOperation {
  label: string;
  updatedAt: number;
}

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

export type FieldQualifierPosition =
  | "upper_mold"
  | "lower_mold"
  | "pre_pump"
  | "post_pump"
  | "pre_mesh"
  | "post_mesh"
  | "inlet"
  | "c_inlet";

export interface FieldQualifier {
  position?: FieldQualifierPosition;
  sourceText?: string;
  [key: string]: unknown;
}

export interface FieldRoughness {
  raw: string;
  grade?: string;
  bound?: "lt" | "lte" | "gt" | "gte";
  value?: number;
  rangeMin?: number;
  rangeMax?: number;
  unit?: "μm" | "um";
  [key: string]: unknown;
}

export interface FieldDictionary extends Record<string, any> {
  roughness?: FieldRoughness;
}

export interface QuoteAgentField {
  field_name?: string;
  raw_value?: string;
  qualifier?: FieldQualifier;
  dictionary?: FieldDictionary;
  masterDataMatch?: Record<string, any> | null;
  master_data_match?: Record<string, any> | null;
  candidate?: Record<string, any> | null;
  evidence?: unknown;
  warnings?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type ProductMasterDataTermType = "metering_pump_model" | "filter_model";

export interface ProductMasterDataCandidate {
  id?: string | number;
  model?: string;
  name?: string;
  pumpage?: string | number;
  rotateSpeed?: string | number;
  heatingPower?: string | number;
  shearSensitivity?: string | number;
  production?: string | number;
  filterBoard?: string | number;
  dimension?: string;
  weight?: string | number;
  meshDiameter?: string | number;
  effectiveFilterArea?: string | number;
  power?: string | number;
  pressure?: string | number;
  [key: string]: any;
}

export interface ProductMasterDataSearchResponse {
  items?: ProductMasterDataCandidate[];
  results?: ProductMasterDataCandidate[];
  data?: ProductMasterDataCandidate[] | { items?: ProductMasterDataCandidate[]; results?: ProductMasterDataCandidate[] };
  [key: string]: unknown;
}

export interface ProductModelBindingPayload {
  termType: ProductMasterDataTermType;
  rawValue: string;
  fieldName?: string;
  itemIndex?: string | number;
  documentId?: string | number;
  extractionResultId?: string | number;
  sourceTable: "crm_products_pump" | "crm_product_filter";
  masterDataId?: string | number;
  model?: string;
  candidate: ProductMasterDataCandidate;
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

export interface Candidate {
  id: string | number;
  status?: CandidateStatus | string;
  candidateType?: CandidateType;
  rawFieldName?: string;
  rawValue?: string;
  termType?: string;
  reason?: string;
  evidence?: Record<string, any> | null;
  documentId?: number | string;
  extractionResultId?: number | string;
  itemIndex?: number | string;
  sourceProductType?: string;
  sourceRawValue?: string;
  reviewSuggestion?: Record<string, any> | null;
  [key: string]: any;
}

export interface CandidatesResponse {
  termTypeCandidates: Candidate[];
  valueCandidates: Candidate[];
  suggestions?: unknown;
}

export type CandidateClusterRiskLevel = "low" | "medium" | "high" | string;

export interface CandidateClusterOccurrence {
  documentId?: string | number;
  document?: string;
  documentName?: string;
  fileName?: string | null;
  itemIndex?: string | number;
  item?: string | number;
  itemName?: string | null;
  rawFieldName?: string;
  rawValue?: string | null;
  context?: string;
  [key: string]: any;
}

export interface CandidateClusterSuggestion {
  recommendedAction?: ReviewAction | string;
  confidence?: number;
  riskLevel?: CandidateClusterRiskLevel;
  needsHumanReview?: boolean;
  needs_human_review?: boolean;
  humanReviewSummary?: string;
  human_review_summary?: string;
  reason?: string;
  batchOperationsPreview?: ReviewOperation[];
  batch_operations_preview?: ReviewOperation[];
  [key: string]: any;
}

export interface CandidateCluster {
  id?: string | number;
  clusterId?: string | number;
  clusterKey?: string;
  candidateType?: CandidateType;
  termType?: string;
  normalizedFieldName?: string;
  normalizedRawValue?: string;
  candidateIds?: Array<string | number>;
  documentCount?: number;
  occurrenceCount?: number;
  sourceProductType?: string;
  reason?: string;
  rawFieldNameSamples?: string[];
  rawValueSamples?: string[];
  commonContexts?: string[];
  sampleOccurrences?: CandidateClusterOccurrence[];
  reviewSuggestion?: CandidateClusterSuggestion | null;
  batchOperationsPreview?: ReviewOperation[];
  invalidSuggestionReason?: string;
  submitError?: string;
  [key: string]: any;
}

export interface CandidateClustersResponse {
  candidateClusters?: CandidateCluster[];
  clusters?: CandidateCluster[];
  items?: CandidateCluster[];
  data?: CandidateCluster[];
  summary?: {
    status?: string;
    candidateType?: "all" | CandidateType;
    documentId?: number | string | null;
    limit?: number | null;
    clusterCount?: number;
    termTypeClusterCount?: number;
    valueClusterCount?: number;
    returnedClusterCount?: number;
    [key: string]: unknown;
  };
  options?: {
    productTypes?: ProductTypeOption[];
    termTypes?: DictionaryTermType[];
    enumValues?: DictionaryValue[];
    runPolicy?: Record<string, unknown>;
    [key: string]: unknown;
  };
  productTypes?: ProductTypeOption[];
  termTypes?: DictionaryTermType[];
  enumValues?: DictionaryValue[];
  priorDecisions?: unknown[];
  runPolicy?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CandidateClusterReviewPromptResponse {
  prompt?: string;
  promptTemplate?: string;
  placeholders?: {
    productTypes?: string;
    termTypes?: string;
    enumValues?: string;
    candidateClusters?: string;
    priorDecisions?: string;
    [key: string]: string | undefined;
  };
  systemPrompt?: string;
  inputShape?: Record<string, unknown>;
  outputShape?: Record<string, unknown>;
  content?: string;
  [key: string]: unknown;
}

export interface CandidateClusterPromptData {
  productTypes: unknown[];
  termTypes: unknown[];
  enumValues: unknown[];
  priorDecisions: unknown[];
  runPolicy?: Record<string, unknown>;
}

export interface CandidateClusterFilters {
  status: CandidateStatus;
  candidateType?: "all" | CandidateType;
  documentId?: string | number;
  limit?: number;
}

export interface DictionaryTermType {
  id?: string | number;
  termType?: string;
  displayName?: string;
  quoteDisplayName?: string;
  category?: string;
  valueKind?: string;
  applicableProductTypes?: string[];
  aliases?: Array<string | DictionaryAlias>;
  aliasNames?: Array<string | DictionaryAlias>;
  enumValues?: unknown;
  sortOrder?: number;
  [key: string]: any;
}

export interface DictionaryValue {
  id?: string | number;
  termType?: string;
  canonicalValue?: string;
  displayName?: string;
  aliasNames?: Array<string | DictionaryAlias>;
  aliases?: Array<string | DictionaryAlias>;
  [key: string]: any;
}

export interface DictionaryAlias {
  id?: string | number;
  termId?: string | number;
  termType?: string;
  aliasValue?: string;
  aliasName?: string;
  value?: string;
  name?: string;
  isActive?: boolean;
  [key: string]: any;
}

export interface ProductTypeOption {
  canonicalValue?: string;
  value?: string;
  displayName?: string;
  label?: string;
  [key: string]: any;
}

export interface PendingLlmUploadJob {
  status?: string;
  concurrency?: number;
  total?: number;
  processed?: number;
  successCount?: number;
  failedCount?: number;
  currentDocumentIds?: Array<number | string>;
  documentProgress?: Array<Record<string, any>>;
  startedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface DictionaryOptions {
  termTypes: DictionaryTermType[];
  values: DictionaryValue[];
  productTypes: ProductTypeOption[];
}

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

export interface UnitAlias {
  id?: string | number;
  canonicalUnit?: string;
  aliasValue?: string;
  displayUnit?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface UnitAliasesResponse {
  aliases?: UnitAlias[];
  unitAliases?: UnitAlias[];
  items?: UnitAlias[];
  data?: UnitAlias[] | { aliases?: UnitAlias[]; items?: UnitAlias[] };
  [key: string]: unknown;
}

export interface UnitCandidate {
  id: string | number;
  status?: CandidateStatus | string;
  rawValue?: string;
  rawUnit?: string;
  normalizedRawUnit?: string;
  proposedCanonicalUnit?: string;
  documentId?: string | number;
  termType?: string;
  parsedValue?: unknown;
  parsedResult?: unknown;
  parsed?: unknown;
  [key: string]: any;
}

export type UnitCandidateReviewAction = "approve" | "reject" | "needs_human_review";
export type UnitCandidateRiskLevel = "low" | "medium" | "high" | string;

export interface UnitCandidateReviewSuggestion {
  candidateId: string | number;
  recommendedAction: UnitCandidateReviewAction;
  canonicalUnit?: string | null;
  displayUnit?: string | null;
  aliasValue?: string | null;
  confidence?: number | null;
  riskLevel?: UnitCandidateRiskLevel;
  needsHumanReview?: boolean;
  needs_human_review?: boolean;
  reason?: string;
  [key: string]: any;
}

export interface UnitCandidateReviewPromptResponse {
  prompt?: string;
  promptTemplate?: string;
  placeholders?: {
    unitAliases?: string;
    unitCandidates?: string;
    [key: string]: string | undefined;
  };
  inputShape?: Record<string, unknown>;
  outputShape?: Record<string, unknown>;
  applyPolicy?: Record<string, unknown>;
  content?: string;
  systemPrompt?: string;
  [key: string]: unknown;
}

export interface UnitCandidatesResponse {
  candidates?: UnitCandidate[];
  unitCandidates?: UnitCandidate[];
  items?: UnitCandidate[];
  data?: UnitCandidate[] | { candidates?: UnitCandidate[]; items?: UnitCandidate[] };
  [key: string]: unknown;
}

export interface UnitAliasPayload {
  canonicalUnit: string;
  aliasValue: string;
  displayUnit: string;
  reviewedBy?: string;
}
