import type { DictionaryTermType, DictionaryValue, ProductTypeOption } from "../quoteAgent/types";

export type TermTypeFormValues = {
  id?: string | number;
  termType: string;
  displayName: string;
  quoteDisplayName: string;
  category: string;
  valueKind: string;
  applicableProductTypes: string;
  aliases: string;
  sortOrder: string;
};

export type DictionaryValueFormValues = {
  id?: string | number;
  termType: string;
  canonicalValue: string;
  displayName: string;
  aliases: string;
};

export type DictionaryEditorState =
  | { kind: "termType"; mode: "create" | "edit"; record?: DictionaryTermType; values: TermTypeFormValues }
  | { kind: "value"; mode: "create" | "edit"; record?: DictionaryValue; values: DictionaryValueFormValues }
  | null;

export type DictionaryManagerState = {
  keyword: string;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  termTypes: DictionaryTermType[];
  values: DictionaryValue[];
  productTypes: ProductTypeOption[];
  filteredTermTypes: DictionaryTermType[];
  editor: DictionaryEditorState;
  setKeyword: (keyword: string) => void;
  reload: (options?: { force?: boolean }) => Promise<void>;
  openCreateTermType: () => void;
  openEditTermType: (record: DictionaryTermType) => void;
  openCreateValue: (termType?: string) => void;
  openEditValue: (record: DictionaryValue) => void;
  closeEditor: () => void;
  updateEditorValues: (values: Partial<TermTypeFormValues> | Partial<DictionaryValueFormValues>) => void;
  submitEditor: () => Promise<void>;
};
