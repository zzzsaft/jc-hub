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
