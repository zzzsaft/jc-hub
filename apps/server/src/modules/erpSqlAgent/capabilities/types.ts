export type GoldenExpectedOutcome = "execute" | "clarify" | "unsupported";

export type ErpSqlCapabilityDefinition = {
  code: string;
  status: "executable" | "clarification_only" | "unsupported" | "planned";
  modules: string[];
  metrics: string[];
  dimensions: string[];
  filterSlots: string[];
  timeSemantics: string[];
  comparisonKinds: Array<"year_over_year" | "month_over_month">;
  templateFamilies: string[];
  reasonCode?: string;
};

export type GoldenCapabilityCase = {
  businessType: string;
  question: string;
  expectedFamilyIds: string[];
  tags: string[];
  capability: string;
  expectedOutcome: GoldenExpectedOutcome;
  requiredMetrics: string[];
  requiredDimensions: string[];
  requiredFilters: string[];
  requiredTimeSemantics: string[];
  allowedTemplateFamilies: string[];
  unsupportedReason: string | null;
};
