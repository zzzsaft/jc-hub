import "../../../config/env.js";
import { prisma } from "../../../lib/prisma.js";
import { syncJdyCrmCustomers } from "../crmCustomers.js";

const DEFAULT_CRM_APP_ID = "6191e49fc6c18500070f60ca";
const DEFAULT_CRM_CUSTOMER_ENTRY_ID = "020100200000000000000001";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

try {
  const result = await syncJdyCrmCustomers({
    apiKey: required("JDY_API_KEY"),
    baseUrl: process.env.JDY_API_BASE_URL?.trim() || undefined,
    appId: process.env.JDY_CRM_APP_ID?.trim() || DEFAULT_CRM_APP_ID,
    entryId: process.env.JDY_CRM_CUSTOMER_ENTRY_ID?.trim() || DEFAULT_CRM_CUSTOMER_ENTRY_ID,
    nameField: process.env.JDY_CRM_CUSTOMER_NAME_FIELD?.trim() || undefined,
    shortNameField: process.env.JDY_CRM_CUSTOMER_SHORT_NAME_FIELD?.trim() || undefined,
    codeField: process.env.JDY_CRM_CUSTOMER_CODE_FIELD?.trim() || undefined,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const err = error as { code?: string; message?: string; response?: { status?: number; data?: unknown } };
  console.error(JSON.stringify({
    ok: false,
    code: err.code,
    status: err.response?.status,
    message: err.message ?? String(error),
    response: typeof err.response?.data === "string" ? err.response.data.slice(0, 500) : err.response?.data,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
