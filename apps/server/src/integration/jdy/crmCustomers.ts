import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ErpSqlCustomerNameResolution } from "../../modules/erpSqlAgent/agent/index.js";
import { JdyClient, type JdyDataRow, type JdyWidget } from "./client.js";

export type JdyCrmCustomerSyncConfig = {
  apiKey: string;
  baseUrl?: string;
  appId: string;
  entryId: string;
  nameField?: string;
  shortNameField?: string;
  codeField?: string;
};

export type JdyCrmCustomerSyncResult = {
  fetched: number;
  upserted: number;
  skipped: number;
  fields: {
    nameField: string;
    shortNameField: string;
    codeField?: string;
  };
};

export async function syncJdyCrmCustomers(config: JdyCrmCustomerSyncConfig): Promise<JdyCrmCustomerSyncResult> {
  const client = new JdyClient(config);
  const fields = await resolveCustomerFields(client, config);
  const rows = await client.listAllData();
  let skipped = 0;
  const customers: JdyCrmCustomerUpsertInput[] = [];

  for (const row of rows) {
    const dataId = textValue(readJdyField(row, "_id") ?? row.data_id ?? row.dataId);
    const customerName = textValue(readJdyField(row, fields.nameField));
    if (!dataId || !customerName) {
      skipped += 1;
      continue;
    }
    customers.push({
      dataId,
      customerName,
      shortName: textValue(readJdyField(row, fields.shortNameField)) || null,
      customerCode: fields.codeField ? textValue(readJdyField(row, fields.codeField)) || null : null,
      rawData: row,
    });
  }
  const upserted = await upsertJdyCrmCustomers(customers);

  return { fetched: rows.length, upserted, skipped, fields };
}

export async function resolveJdyCrmCustomerName(value: string): Promise<ErpSqlCustomerNameResolution | undefined> {
  const keyword = value.trim();
  if (!keyword) return undefined;
  const rows = await prisma.$queryRaw<Array<{ customer_name: string; short_name: string | null; customer_code: string | null; match_rank: number }>>`
    SELECT customer_name, short_name, customer_code,
      CASE
        WHEN short_name = ${keyword} THEN 0
        WHEN customer_code = ${keyword} THEN 1
        WHEN customer_name = ${keyword} THEN 2
        ELSE 3
      END AS match_rank
    FROM integration.jdy_crm_customers
    WHERE short_name = ${keyword}
       OR customer_code = ${keyword}
       OR customer_name = ${keyword}
       OR short_name ILIKE ${`%${keyword}%`}
       OR customer_code ILIKE ${`%${keyword}%`}
       OR customer_name ILIKE ${`%${keyword}%`}
    ORDER BY
      match_rank,
      length(customer_name) ASC
    LIMIT 6
  `;
  if (rows.length === 0) return undefined;
  if (rows[0] && rows[0].match_rank <= 2) return rows[0].customer_name;
  if (rows.length > 1) {
    return {
      status: "ambiguous",
      keyword,
      candidates: rows.slice(0, 5).map((row) => ({
        customerName: row.customer_name,
        shortName: row.short_name,
        customerCode: row.customer_code,
      })),
    };
  }
  return rows[0]?.customer_name;
}

type JdyCrmCustomerUpsertInput = {
  dataId: string;
  customerName: string;
  shortName: string | null;
  customerCode: string | null;
  rawData: JdyDataRow;
};

async function upsertJdyCrmCustomers(inputs: JdyCrmCustomerUpsertInput[]): Promise<number> {
  const batchSize = 500;
  let count = 0;
  for (let index = 0; index < inputs.length; index += batchSize) {
    const batch = inputs.slice(index, index + batchSize);
    if (batch.length === 0) continue;
    await prisma.$executeRaw`
      INSERT INTO integration.jdy_crm_customers
        (data_id, customer_name, short_name, customer_code, raw_data, synced_at, created_at, updated_at)
      VALUES ${Prisma.join(batch.map((input) => Prisma.sql`(
        ${input.dataId},
        ${input.customerName},
        ${input.shortName},
        ${input.customerCode},
        ${input.rawData as Prisma.InputJsonObject},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`))}
      ON CONFLICT (data_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        short_name = EXCLUDED.short_name,
        customer_code = EXCLUDED.customer_code,
        raw_data = EXCLUDED.raw_data,
        synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `;
    count += batch.length;
  }
  return count;
}

function readJdyField(row: JdyDataRow, field: string): unknown {
  const value = row[field];
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) return (value as { value?: unknown }).value;
  return value;
}

async function resolveCustomerFields(client: JdyClient, config: JdyCrmCustomerSyncConfig) {
  if (config.nameField && config.shortNameField) {
    return { nameField: config.nameField, shortNameField: config.shortNameField, codeField: config.codeField };
  }
  const widgets = await client.listWidgets();
  const nameField = config.nameField ?? findWidgetId(widgets, ["客户名称", "客户", "公司名称", "单位名称"]);
  const shortNameField = config.shortNameField ?? findWidgetId(widgets, ["简称", "别名", "客户简称", "公司简称"]);
  const codeField = config.codeField ?? findWidgetId(widgets, ["CustNum", "客户编号", "客户编码", "客户代码", "客户ID", "CustID"]);
  if (!nameField || !shortNameField) {
    throw new Error(`JDY CRM customer fields not found. nameField=${nameField || "missing"}, shortNameField=${shortNameField || "missing"}. Set JDY_CRM_CUSTOMER_NAME_FIELD and JDY_CRM_CUSTOMER_SHORT_NAME_FIELD.`);
  }
  return { nameField, shortNameField, codeField };
}

function findWidgetId(widgets: JdyWidget[], names: string[]): string | undefined {
  const normalizedNames = new Set(names.map(normalizeText));
  for (const widget of widgets) {
    const label = normalizeText(widget.label ?? widget.name ?? widget.title);
    if (!normalizedNames.has(label)) continue;
    return textValue(widget.name ?? widget.widgetName ?? widget.widget_id ?? widget._widget_id ?? widget.id ?? widget.field_id);
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(",");
  return String(value ?? "").trim();
}
