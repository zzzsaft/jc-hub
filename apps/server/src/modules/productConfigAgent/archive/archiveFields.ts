export type ArchiveColumnSummary = {
  docInfo: Record<string, unknown>;
  productNumber: string | null;
  contractNumber: string | null;
  orderNumber: string | null;
  customerId: string | null;
  country: string | null;
  orderDate: Date | null;
  deliveryDate: Date | null;
};

export type ArchiveItemColumnSummary = {
  itemIndex: number;
  itemName: string | null;
  itemQuantity: string | null;
  productTypeHint: string | null;
  productTypeRawValue: string | null;
  productTypeDisplayName: string | null;
  sourceProductNumber: string | null;
  productNumberStatus: "missing" | "inherited" | "partially_bound" | "bound" | "ambiguous";
  fieldsJson: unknown;
  warningsJson: unknown;
};

export function summarizeArchiveColumns(normalizedExtractionJson: unknown): ArchiveColumnSummary {
  const root = asRecord(normalizedExtractionJson);
  const docInfo = normalizeDocInfo(root.document_info);
  return {
    docInfo,
    productNumber: firstFieldValue(docInfo, "product_number", "productNumber", "产品编号", "产品号", "die_number"),
    contractNumber: firstFieldValue(docInfo, "contract_number", "contractNumber", "合同号", "合同编号"),
    orderNumber: firstFieldValue(docInfo, "order_number", "orderNumber", "订单号"),
    customerId: firstFieldValue(docInfo, "customer_id", "customerId", "客户ID", "客户编号"),
    country: firstFieldValue(docInfo, "country", "国家"),
    orderDate: coerceDate(firstFieldValue(docInfo, "order_date", "orderDate", "订单日期", "下单日期")),
    deliveryDate: coerceDate(firstFieldValue(docInfo, "delivery_date", "deliveryDate", "交期", "交货日期")),
  };
}

export function summarizeArchiveItems(normalizedExtractionJson: unknown): ArchiveItemColumnSummary[] {
  const root = asRecord(normalizedExtractionJson);
  const summary = summarizeArchiveColumns(root);
  const items = Array.isArray(root.items) ? root.items : [];
  const multipleItems = items.length > 1;
  return items.map((value, index) => {
    const item = asRecord(value);
    const productType = item.itemProductTypeHint ?? item.product_type_hint;
    const productTypeRecord = asRecord(productType);
    const productTypeValue = firstString(
      productTypeRecord.value,
      productTypeRecord.canonical_value,
      productType,
    );
    const sourceProductNumber = firstString(
      item.sourceProductNumber,
      item.source_product_number,
      summary.productNumber,
    );
    return {
      itemIndex: numberOrDefault(item.item_index ?? item.itemIndex, index),
      itemName: firstString(item.item_name, item.itemName),
      itemQuantity: firstString(item.item_quantity, item.itemQuantity),
      productTypeHint: productTypeValue,
      productTypeRawValue: firstString(
        item.itemProductTypeHintRawValue,
        item.product_type_raw_value,
        productTypeRecord.raw_value,
        productType,
      ),
      productTypeDisplayName: firstString(
        item.itemProductTypeHintDisplayName,
        item.product_type_display_name,
        productTypeRecord.display_name,
        productTypeRecord.value,
      ),
      sourceProductNumber,
      productNumberStatus: sourceProductNumber
        ? multipleItems
          ? "inherited"
          : "bound"
        : "missing",
      fieldsJson: Array.isArray(item.fields) ? item.fields : item.fields ?? item.raw_fields ?? [],
      warningsJson: Array.isArray(item.warnings) ? item.warnings : [],
    };
  });
}

export function normalizeDocInfo(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key.trim(), item]),
  );
}

export function firstFieldValue(
  docInfo: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = firstString(docInfo[key]);
    if (value) return value;
  }
  return null;
}

export function unwrapFieldValue(value: unknown): unknown {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return value;
  if ("value" in record) return record.value;
  if ("raw_value" in record) return record.raw_value;
  return value;
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const unwrapped = unwrapFieldValue(value);
    if (typeof unwrapped === "string" && unwrapped.trim()) return unwrapped.trim();
    if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) return String(unwrapped);
  }
  return null;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function numberOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function coerceDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
