export type ErpModuleName = "sales" | "purchase" | "production" | "inventory" | "finance" | "custom";

export type ErpModuleRule = {
  module: ErpModuleName;
  label: string;
  description: string;
  coreTables: string[];
  keywords: string[];
};

export type JoinRule = {
  module: ErpModuleName;
  name: string;
  from: string;
  to: string;
  joinType: "INNER" | "LEFT";
  on: string[];
  notes?: string;
};

export type DateSafetyRange = {
  minExpression: string;
  maxExpression: string;
};

export type ModuleDateRule = {
  module: ErpModuleName;
  preferredFields: string[];
};

export type DateRules = {
  globalSafetyRange: DateSafetyRange;
  notDateFields: string[];
  moduleDateFields: ModuleDateRule[];
};

export type StatusRule = {
  module?: ErpModuleName;
  table: string;
  field: string;
  behavior: "excludeByDefault" | "preserve";
  defaultPredicate?: string;
  allowedValues?: string[];
  notes?: string;
};

export type StatusRules = {
  rules: StatusRule[];
};

export type QualityRule = {
  id: string;
  title: string;
  detail: string;
  recommendation?: string;
};

export type QualityRules = {
  allowedCompanies: string[];
  mustOutputCompany: boolean;
  rules: QualityRule[];
  abnormalDateFields: string[];
};

export type CompanyRules = {
  mustOutputCompany: boolean;
  mustJoinOnCompany: boolean;
  doNotDefaultSingleCompany: boolean;
};

export type PromptRules = {
  mode: "SELECT_ONLY";
  defaultLimit: number;
  mustExplain: string[];
  financialConclusionRequirement: string;
};
