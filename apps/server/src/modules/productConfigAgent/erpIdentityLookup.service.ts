import { getErpSqlQueryClient, type ErpSqlQueryValue } from "../erpSqlAgent/query/index.js";
import { prisma } from "../../lib/prisma.js";
import { summarizeArchiveColumns } from "./archive/archiveFields.js";
import { matchErpPackageProducts, type ErpPackageProductInput } from "./erpIdentityMatcher.js";

export type ErpIdentityLookupInput = {
  documentId?: string | number;
  itemIndex?: string | number;
  productNumber?: string;
  orderNumber?: string | number;
  contractNumber?: string | number;
  customerText?: string;
  itemText?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  limit?: number;
  company?: string;
};

export type ErpIdentityCandidate = {
  company: string | null;
  productNumber: string | null;
  productName: string | null;
  customerId: string | null;
  customerName: string | null;
  orderNumber: string | null;
  orderLine: string | null;
  orderDate: string | null;
  requestDate: string | null;
  quantity: string | null;
  amount: string | null;
  price: null;
  prodCode: string | null;
  prodGroupName: string | null;
  classId: string | null;
  className: string | null;
  hasBom: boolean;
  source: "erp_order_detail";
  confidence: number;
  clues: string[];
  evidence: Record<string, unknown>;
};

const SALES_ORDER_IDENTITY_SELECT = `SELECT TOP 100
  oh.Company AS [company],
  oh.OrderNum AS [orderNumber],
  od.OrderLine AS [orderLine],
  c.CustID AS [customerId],
  c.Name AS [customerName],
  od.PartNum AS [productNumber],
  COALESCE(NULLIF(od.LineDesc, ''), p.PartDescription) AS [productName],
  p.ProdCode AS [prodCode],
  pg.Description AS [prodGroupName],
  p.ClassID AS [classId],
  pc.Description AS [className],
  CASE WHEN EXISTS (
    SELECT 1 FROM Erp.PartMtl pm
     WHERE pm.Company = p.Company AND pm.PartNum = p.PartNum
  ) THEN 1 ELSE 0 END AS [hasBom],
  od.OrderQty AS [quantity],
  od.DocExtPriceDtl AS [amount],
  oh.OrderDate AS [orderDate],
  od.RequestDate AS [requestDate],
  od.OpenLine AS [openLine]
FROM Erp.OrderHed oh
INNER JOIN Erp.OrderDtl od ON od.Company = oh.Company AND od.OrderNum = oh.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN Erp.Part p ON p.Company = od.Company AND p.PartNum = od.PartNum
LEFT JOIN Erp.ProdGrup pg ON pg.Company = p.Company AND pg.ProdCode = p.ProdCode
LEFT JOIN Erp.PartClass pc ON pc.Company = p.Company AND pc.ClassID = p.ClassID`;

export type ErpPackageIdentityInput = {
  company?: string;
  orderNumber?: string | number;
  contractNumber?: string | number;
  customerText?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  items: ErpPackageProductInput[];
  limit?: number;
};

type QueryClient = {
  query(options: { sql: string; params?: ErpSqlQueryValue[]; maxRows?: number }): Promise<{
    fields: string[];
    rows: unknown[][];
    rowCount: number;
    truncated: boolean;
  }>;
};

export class ProductConfigErpIdentityLookupService {
  constructor(private readonly queryClient?: QueryClient) {}

  async lookup(input: ErpIdentityLookupInput) {
    const context = input.documentId ? await this.contextFromDocument(input) : {};
    const criteria = { ...context, ...cleanInput(input) };
    const hasUsefulFilter = Boolean(
      criteria.orderNumber || criteria.productNumber || criteria.customerText || criteria.itemText,
    );
    if (!hasUsefulFilter) {
      return { criteria, candidates: [], warnings: ["Need product, order, customer, or item text before querying ERP."] };
    }

    const sql = buildSalesOrderIdentitySql(criteria);
    if (!sql) return { criteria, candidates: [], warnings: ["No safe ERP query filter could be built from the supplied identity evidence."] };
    const result = await (this.queryClient ?? getErpSqlQueryClient()).query({
      sql,
      maxRows: Math.min(Math.max(Number(input.limit ?? 20) || 20, 1), 100),
    });

    return {
      criteria,
      candidates: result.rows.map((row) => mapCandidate(result.fields, row, criteria)),
      truncated: result.truncated,
    };
  }

  async linkPackage(input: ErpPackageIdentityInput) {
    if (!input.items.length) return { criteria: cleanInput(input), candidates: [], resolutions: [], warnings: ["Package has no product items."] };
    const items = input.items.map((item) => ({ ...item, company: item.company ?? input.company }));
    const common = {
      orderNumber: input.orderNumber,
      contractNumber: input.contractNumber,
      customerText: input.customerText,
      orderDateFrom: input.orderDateFrom,
      orderDateTo: input.orderDateTo,
      limit: input.limit ?? 100,
      company: input.company,
    };
    let candidates: ErpIdentityCandidate[] = [];
    if (parseOrderNumber(input.orderNumber) !== null) {
      candidates = (await this.lookup(common)).candidates;
    } else {
      const searches = await Promise.all(items.map((item) => this.lookup({
        ...common,
        productNumber: item.productNumber,
        itemText: item.productNumber ? undefined : item.productName,
        limit: Math.min(input.limit ?? 20, 30),
      })));
      const unique = new Map<string, ErpIdentityCandidate>();
      for (const candidate of searches.flatMap((result) => result.candidates)) {
        const key = `${candidate.company}:${candidate.productNumber}`;
        if (!unique.has(key)) unique.set(key, candidate);
      }
      candidates = [...unique.values()];
    }
    return {
      criteria: cleanInput(input),
      candidates,
      resolutions: matchErpPackageProducts(items, candidates),
      warnings: candidates.length ? [] : ["ERP returned no product identity candidates."],
    };
  }

  private async contextFromDocument(input: ErpIdentityLookupInput): Promise<Partial<ErpIdentityLookupInput>> {
    const [document, extractions] = await Promise.all([
      prisma.productDocument.findUnique({ where: { id: BigInt(input.documentId!) } }),
      prisma.extractionResult.findMany({
        where: { documentId: BigInt(input.documentId!) },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    const extraction = extractions.find((row) => Object.keys(objectRecord(row.normalizedExtractionJson)).length)
      ?? extractions.find((row) => Object.keys(objectRecord(row.llmPlanJson)).length)
      ?? extractions[0];
    const normalized = objectRecord(extraction?.normalizedExtractionJson);
    const plan = objectRecord(extraction?.llmPlanJson);
    const raw = objectRecord(extraction?.extractionJson);
    const columns = summarizeArchiveColumns(
      Object.keys(normalized).length ? normalized : { document_info: plan.document_info },
    );
    const item = resolveIdentityItem(normalized, raw, plan, input.itemIndex);
    const itemText = firstText(
      objectRecord(item).item_name,
      objectRecord(item).itemName,
      objectRecord(item).source_product_number,
      fileStem(document?.fileName),
    );

    return {
      productNumber: singleProductNumber(firstText(objectRecord(item).product_number, objectRecord(item).productNumber, objectRecord(item).source_product_number, columns.productNumber)) ?? undefined,
      orderNumber: columns.orderNumber ?? undefined,
      contractNumber: columns.contractNumber ?? undefined,
      customerText: columns.customerId ?? undefined,
      itemText: itemText ?? undefined,
      orderDateFrom: dateOffset(columns.orderDate, -365),
      orderDateTo: dateOffset(columns.orderDate, 365),
    };
  }
}

function cleanInput(input: ErpIdentityLookupInput): Partial<ErpIdentityLookupInput> {
  return Object.fromEntries(Object.entries({
    productNumber: clean(input.productNumber),
    company: clean(input.company),
    orderNumber: clean(input.orderNumber),
    contractNumber: clean(input.contractNumber),
    customerText: clean(input.customerText),
    itemText: clean(input.itemText),
    orderDateFrom: clean(input.orderDateFrom),
    orderDateTo: clean(input.orderDateTo),
  }).filter(([, value]) => value !== undefined));
}

function mapCandidate(fields: string[], row: unknown[], criteria: Partial<ErpIdentityLookupInput>): ErpIdentityCandidate {
  const value = Object.fromEntries(fields.map((field, index) => [field, row[index]]));
  const clues: string[] = [];
  if (same(value.productNumber, criteria.productNumber)) clues.push("product_number_exact");
  if (same(value.orderNumber, criteria.orderNumber ?? criteria.contractNumber)) clues.push("order_number_exact");
  if (contains(value.customerName, criteria.customerText) || contains(value.customerId, criteria.customerText)) clues.push("customer_match");
  if (contains(value.productName, erpSearchText(criteria.itemText)) || contains(value.productNumber, criteria.itemText)) clues.push("item_text_match");
  if (criteria.orderDateFrom || criteria.orderDateTo) clues.push("date_window");
  return {
    company: text(value.company),
    productNumber: text(value.productNumber),
    productName: text(value.productName),
    customerId: text(value.customerId),
    customerName: text(value.customerName),
    orderNumber: text(value.orderNumber),
    orderLine: text(value.orderLine),
    orderDate: text(value.orderDate),
    requestDate: text(value.requestDate),
    quantity: text(value.quantity),
    amount: text(value.amount),
    price: null,
    prodCode: text(value.prodCode),
    prodGroupName: text(value.prodGroupName),
    classId: text(value.classId),
    className: text(value.className),
    hasBom: value.hasBom === true || value.hasBom === 1 || value.hasBom === "1",
    source: "erp_order_detail",
    confidence: confidence(clues),
    clues,
    evidence: value,
  };
}

function confidence(clues: string[]): number {
  const score = clues.reduce((sum, clue) => sum + ({ product_number_exact: 0.45, order_number_exact: 0.25, customer_match: 0.15, item_text_match: 0.1, date_window: 0.05 }[clue] ?? 0), 0.2);
  return Math.min(0.95, Number(score.toFixed(2)));
}

function findItem(items: unknown, itemIndex: unknown): unknown {
  if (!Array.isArray(items) || itemIndex === undefined) return undefined;
  return items.find((item, offset) => Number(objectRecord(item).item_index ?? objectRecord(item).itemIndex ?? offset + 1) === Number(itemIndex));
}

export function resolveIdentityItem(normalized: unknown, raw: unknown, plan: unknown, itemIndex: unknown): unknown {
  const normalizedRecord = objectRecord(normalized);
  const rawRecord = objectRecord(raw);
  const planRecord = objectRecord(plan);
  return [
    findItem(normalizedRecord.items, itemIndex),
    findItem(objectRecord(rawRecord.extraction).items ?? rawRecord.items, itemIndex),
    findItem(planRecord.items, itemIndex),
  ].find((candidate) => firstText(objectRecord(candidate).item_name, objectRecord(candidate).itemName, objectRecord(candidate).product_name));
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstText(...values: unknown[]): string | undefined {
  return values.map(text).find(Boolean) ?? undefined;
}

function text(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return null;
}

function clean(value: unknown): string | undefined {
  return text(value) ?? undefined;
}

function same(left: unknown, right: unknown): boolean {
  return Boolean(clean(left) && clean(right) && clean(left) === clean(right));
}

function contains(left: unknown, right: unknown): boolean {
  return Boolean(clean(left) && clean(right) && clean(left)!.toLowerCase().includes(clean(right)!.toLowerCase()));
}

function parseOrderNumber(value: unknown): number | null {
  const cleaned = clean(value);
  if (!cleaned || !/^\d+$/u.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isSafeInteger(number) ? number : null;
}

export function buildSalesOrderIdentitySql(criteria: Partial<ErpIdentityLookupInput>): string | null {
  const filters: string[] = [];
  const orderNumber = parseOrderNumber(criteria.orderNumber);
  if (orderNumber !== null) filters.push(`oh.OrderNum = ${orderNumber}`);
  if (clean(criteria.customerText)) {
    filters.push(`CONCAT(COALESCE(c.Name, N''), N' ', COALESCE(c.CustID, N'')) LIKE ${sqlLike(criteria.customerText)}`);
  }
  if (clean(criteria.company)) filters.push(`p.Company = ${sqlText(criteria.company)}`);
  const productNumber = singleProductNumber(criteria.productNumber);
  if (productNumber) filters.push(`od.PartNum = ${sqlText(productNumber)}`);
  if (clean(criteria.itemText)) {
    filters.push(`CONCAT(COALESCE(od.PartNum, N''), N' ', COALESCE(od.LineDesc, N''), N' ', COALESCE(p.PartDescription, N'')) LIKE ${sqlLike(erpSearchText(criteria.itemText))}`);
  }
  if (validDate(criteria.orderDateFrom)) filters.push(`oh.OrderDate >= ${sqlText(criteria.orderDateFrom)}`);
  if (validDate(criteria.orderDateTo)) filters.push(`oh.OrderDate <= ${sqlText(criteria.orderDateTo)}`);
  if (!filters.length) return null;
  return `${SALES_ORDER_IDENTITY_SELECT}\nWHERE ${filters.join("\n  AND ")}\nORDER BY oh.OrderDate DESC, oh.OrderNum DESC, od.OrderLine ASC`;
}

function sqlText(value: unknown): string {
  return `N'${String(clean(value) ?? "").replace(/'/g, "''")}'`;
}

function sqlLike(value: unknown): string {
  const escaped = String(clean(value) ?? "").replace(/\[/g, "[[]").replace(/%/g, "[%]").replace(/_/g, "[_]");
  return sqlText(`%${escaped}%`);
}

function validDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(clean(value) ?? "");
}

function singleProductNumber(value: unknown): string | undefined {
  const productNumber = clean(value);
  return productNumber && !/[、,，;；\s]+/u.test(productNumber) ? productNumber : undefined;
}

function erpSearchText(value: unknown): string {
  const textValue = String(clean(value) ?? "").replace(/[（(][^）)]*[）)]/gu, " ").trim();
  const productTerm = textValue.match(/(?:静态混合器|液压换网器|换网器|计量泵|传动系统|控制系统|喷丝板|分配器|连接器|联接器|合流器|液压站|风刀|气刀|模头|模具)/u)?.[0];
  return productTerm ?? textValue;
}

function dateOffset(date: Date | null, days: number): string | undefined {
  if (!date) return undefined;
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function fileStem(fileName: string | null | undefined): string | undefined {
  const stem = fileName?.replace(/\.[^.]+$/u, "").trim();
  return stem && stem.length >= 2 ? stem : undefined;
}

export const productConfigErpIdentityLookupService = new ProductConfigErpIdentityLookupService();
