export type PolicyRange = string[] | "*";
export type CustomerRange = number[] | "*";

export type ErpSqlAccessPolicy = {
  id: string;
  userId: string | null;
  roleId: string | null;
  environment: "production" | "development";
  rolloutMode: string;
  companies: string[];
  modules: string[];
  departments: PolicyRange;
  businessUnits: PolicyRange;
  customerNumbers: CustomerRange;
  sensitive: {
    finance: boolean;
    customer: boolean;
    employee: boolean;
  };
  enabled: boolean;
  reason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  approvedBy: string | null;
  effectiveFrom: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PolicyFormState = {
  subjectType: "user" | "role";
  subjectId: string;
  environment: "production" | "development";
  rolloutMode: string;
  companiesText: string;
  modules: string[];
  departmentsText: string;
  businessUnitsText: string;
  customerNumbersText: string;
  sensitiveFinance: boolean;
  sensitiveCustomer: boolean;
  sensitiveEmployee: boolean;
  enabled: boolean;
  reason: string;
  approvedBy: string;
  effectiveFrom: string;
  expiresAt: string;
};

export type PolicyListResponse = {
  items: ErpSqlAccessPolicy[];
  pageInfo: { page: number; pageSize: number; total: number };
};

export type AccessPolicyAuditLog = {
  id: string;
  policyId: string | null;
  action: string;
  actorUserId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};
