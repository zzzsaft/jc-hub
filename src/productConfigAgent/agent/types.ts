export type ProductConfigAgentIntent =
  | "generate_config"
  | "search_cases"
  | "explain_config"
  | "modify_config"
  | "clarify";

export type ProductConfigAgentReferenceMode = "common" | "latest" | "similar" | "deal_won";

export type ProductConfigAgentEntities = {
  customerName?: string;
  customerId?: string;
  industry?: string;
  productType?: string;
  productNumber?: string;
  referenceMode?: ProductConfigAgentReferenceMode;
  constraints?: Record<string, unknown>;
};

export type ProductConfigAgentToolName =
  | "searchArchiveItems"
  | "searchCustomerConfigs"
  | "searchIndustryConfigs"
  | "searchSimilarConfigs"
  | "getProductRules"
  | "generateConfigDraft"
  | "validateConfig"
  | "saveProductConfig";

export type ProductConfigAgentPlanStep = {
  id: string;
  tool: ProductConfigAgentToolName;
  args: Record<string, unknown>;
};

export type ProductConfigAgentPlan = {
  intent: ProductConfigAgentIntent;
  entities: ProductConfigAgentEntities;
  missingRequiredFields: string[];
  steps: ProductConfigAgentPlanStep[];
};

export type ProductConfigAgentValidationIssue = {
  type: string;
  message: string;
  severity: "blocker" | "warning";
  details?: Record<string, unknown>;
};

export type ProductConfigAgentValidationResult = {
  canSave: boolean;
  issues: ProductConfigAgentValidationIssue[];
};

export type ProductConfigAgentDraftConfig = {
  title: string;
  customerName?: string;
  customerId?: string;
  industry?: string;
  productType?: string;
  productNumber?: string;
  items: Array<{
    itemIndex: number;
    productType?: string;
    productNumber?: string;
    fields: Array<{
      fieldName: string;
      termType?: string;
      value: unknown;
      source?: string;
      confidence?: number;
    }>;
  }>;
  evidence: unknown[];
};

export type ProductConfigAgentGeneratedConfigSummary = {
  id: string;
  runId: string;
  sessionId: string;
  title: string | null;
  status: "draft" | "confirmed" | "archived";
  config: unknown;
  validation: unknown;
  shareToken: string | null;
  shareTokenExpiresAt: Date | null;
  shareTokenRevokedAt: Date | null;
  ownerUserId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ProductConfigAgentSaveGeneratedConfigInput = {
  title?: string | null;
  status: "draft" | "confirmed";
  config: unknown;
  validation: unknown;
};

export type ProductConfigAgentContext = {
  toolResults: Record<string, unknown>;
  toolTrace?: Array<{
    stepId: string;
    tool: ProductConfigAgentToolName;
    durationMs: number;
    status: "success" | "failed";
    input: Record<string, unknown>;
    output?: unknown;
    error?: string;
  }>;
  draftConfig: unknown | null;
  validation: ProductConfigAgentValidationResult | null;
  savedConfig: ProductConfigAgentGeneratedConfigSummary | null;
  warnings: string[];
  options?: {
    message: string;
    confirmed?: boolean;
    referenceConfigId?: string;
    llmModel?: string;
    ownerUserId?: string | null;
  };
  saveGeneratedConfig?: (input: ProductConfigAgentSaveGeneratedConfigInput) => Promise<ProductConfigAgentGeneratedConfigSummary>;
};

export type ProductConfigAgentExecuteOptions = {
  context?: Partial<ProductConfigAgentContext>;
  onToolStart?: (event: { step: ProductConfigAgentPlanStep }) => Promise<void>;
  onToolFinish?: (event: { step: ProductConfigAgentPlanStep; result?: unknown; error?: unknown; durationMs: number }) => Promise<void>;
};
