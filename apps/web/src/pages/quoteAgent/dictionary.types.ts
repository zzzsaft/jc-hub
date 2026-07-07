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
