import type { PolicyFormState } from "./types";

export const moduleOptions = [
  { value: "sales", label: "销售" },
  { value: "purchase", label: "采购" },
  { value: "production", label: "生产" },
  { value: "inventory", label: "库存" },
  { value: "finance", label: "财务" },
  { value: "custom", label: "自定义" },
];

export const emptyPolicyForm: PolicyFormState = {
  subjectType: "user",
  subjectId: "",
  environment: "production",
  rolloutMode: "production",
  companiesText: "",
  modules: ["sales"],
  departmentsText: "*",
  businessUnitsText: "*",
  customerNumbersText: "*",
  sensitiveFinance: false,
  sensitiveCustomer: false,
  sensitiveEmployee: false,
  enabled: false,
  reason: "",
  approvedBy: "",
  effectiveFrom: "",
  expiresAt: "",
};
