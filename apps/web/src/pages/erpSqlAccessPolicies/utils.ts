import { emptyPolicyForm } from "./constants";
import type { CustomerRange, ErpSqlAccessPolicy, PolicyFormState, PolicyRange } from "./types";

export const dateText = (value?: string | null) => value ? new Date(value).toLocaleString() : "-";

export const rangeText = (value: PolicyRange | CustomerRange) => value === "*" ? "*" : value.join(", ");

export const parseTextRange = (value: string): PolicyRange => {
  const text = value.trim();
  if (text === "*") return "*";
  return text.split(",").map((item) => item.trim()).filter(Boolean);
};

export const parseCustomerRange = (value: string): CustomerRange => {
  const text = value.trim();
  if (text === "*") return "*";
  return text.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item >= 0);
};

export const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const fromLocalDateTimeInput = (value: string) => value ? new Date(value).toISOString() : null;

export const policyToForm = (policy?: ErpSqlAccessPolicy | null): PolicyFormState => {
  if (!policy) return { ...emptyPolicyForm };
  return {
    subjectType: policy.userId ? "user" : "role",
    subjectId: policy.userId || policy.roleId || "",
    environment: policy.environment,
    rolloutMode: policy.rolloutMode,
    companiesText: policy.companies.join(", "),
    modules: policy.modules,
    departmentsText: rangeText(policy.departments),
    businessUnitsText: rangeText(policy.businessUnits),
    customerNumbersText: rangeText(policy.customerNumbers),
    sensitiveFinance: policy.sensitive.finance,
    sensitiveCustomer: policy.sensitive.customer,
    sensitiveEmployee: policy.sensitive.employee,
    enabled: policy.enabled,
    reason: policy.reason || "",
    approvedBy: policy.approvedBy || "",
    effectiveFrom: toLocalDateTimeInput(policy.effectiveFrom),
    expiresAt: toLocalDateTimeInput(policy.expiresAt),
  };
};

export const formToPayload = (form: PolicyFormState) => ({
  userId: form.subjectType === "user" ? form.subjectId.trim() : undefined,
  roleId: form.subjectType === "role" ? form.subjectId.trim() : undefined,
  environment: form.environment,
  rolloutMode: form.rolloutMode.trim() || "production",
  companies: parseTextRange(form.companiesText),
  modules: form.modules,
  departments: parseTextRange(form.departmentsText),
  businessUnits: parseTextRange(form.businessUnitsText),
  customerNumbers: parseCustomerRange(form.customerNumbersText),
  sensitiveFinance: form.sensitiveFinance,
  sensitiveCustomer: form.sensitiveCustomer,
  sensitiveEmployee: form.sensitiveEmployee,
  enabled: form.enabled,
  reason: form.reason.trim() || null,
  approvedBy: form.approvedBy.trim() || null,
  effectiveFrom: fromLocalDateTimeInput(form.effectiveFrom),
  expiresAt: fromLocalDateTimeInput(form.expiresAt),
});

export const validateForm = (form: PolicyFormState) => {
  if (!form.subjectId.trim()) return "请填写 userId 或 roleId";
  if (!parseTextRange(form.companiesText).length || parseTextRange(form.companiesText) === "*") return "Company 必须是非空列表";
  if (!form.modules.length) return "至少选择一个模块";
  if (!parseTextRange(form.departmentsText).length) return "部门范围必须是非空列表或 *";
  if (!parseTextRange(form.businessUnitsText).length) return "事业部范围必须是非空列表或 *";
  const customers = parseCustomerRange(form.customerNumbersText);
  if (customers !== "*" && !customers.length) return "客户范围必须是非空数字列表或 *";
  return "";
};
