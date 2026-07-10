import { getErpSqlQueryClient, type ErpSqlQueryClient, type ErpSqlQueryResult } from "../erpSqlAgent/query/index.js";
import type {
  ErpPurchaseApplyContract,
  PurchaseApplyFilters,
  PurchaseApplyPreviewGroup,
  PurchaseApplyPreviewRequest,
  PurchaseApplyPreviewResult,
  PurchaseApplyRow,
  PurchaseApplySearchResult,
  PurchaseInventoryDetail,
  PurchasePoDetail,
  PurchaseSourceDetail,
} from "./types.js";

type QueryClient = Pick<ErpSqlQueryClient, "query">;
type RowRecord = Record<string, unknown>;
const SEARCH_ROW_LIMIT = 500;
const SEARCH_PROBE_LIMIT = SEARCH_ROW_LIMIT + 1;

const DEFAULT_FILTERS: PurchaseApplyFilters = {
  partNum: "",
  partDescription: "",
  jobNum: "",
  createdFrom: "",
  createdTo: "",
  requiredFrom: "",
  requiredTo: "",
  area: "",
  demandOnly: true,
  cycleFrom: "",
  cycleTo: "",
  batchArrivalDate: "",
};

export class PurchaseApplyService {
  constructor(private readonly queryClient?: QueryClient) {}

  async search(filters: Partial<PurchaseApplyFilters>): Promise<PurchaseApplySearchResult> {
    const normalized = parsePurchaseApplyFilters(filters);
    const [sources, pos, inventories] = await Promise.all([
      this.querySources(normalized),
      this.queryOpenPos(normalized),
      this.queryInventories(normalized),
    ]);
    const warnings = [
      ...truncationWarnings("工单物料需求", sources),
      ...truncationWarnings("未到货 PO", pos),
      ...truncationWarnings("库存", inventories),
    ];
    return {
      rows: buildRows(limitRows(sources), limitRows(pos), limitRows(inventories), normalized),
      sources: limitRows(sources),
      pos: limitRows(pos),
      inventories: limitRows(inventories),
      ...(warnings.length ? { warnings } : {}),
    };
  }

  preview(input: PurchaseApplyPreviewRequest): PurchaseApplyPreviewResult {
    return buildPurchaseApplyPreview(input);
  }

  erpContract(): ErpPurchaseApplyContract {
    return erpPurchaseApplyContract();
  }

  private async querySources(filters: PurchaseApplyFilters): Promise<PurchaseSourceDetail[]> {
    const result = await this.client().query({
      sql: SOURCE_SQL,
      params: [
        orNull(filters.partNum),
        likeOrNull(filters.partDescription),
        orNull(filters.jobNum),
        orNull(filters.requiredFrom),
        orNull(filters.requiredTo),
        areaToWarehouse(filters.area),
        filters.demandOnly ? 1 : 0,
      ],
      maxRows: SEARCH_PROBE_LIMIT,
    });
    return rowsOf(result).map((row, index) => ({
      id: text(row["id"]) || String(index + 1),
      partNum: text(row["partNum"]),
      area: areaFromWarehouse(text(row["warehouse"])),
      supplierName: "",
      jobNum: text(row["jobNum"]),
      requiredDate: dateText(row["requiredDate"]),
      requiredQty: num(row["requiredQty"]),
      issuedQty: num(row["issuedQty"]),
      balanceQty: num(row["balanceQty"]),
    }));
  }

  private async queryOpenPos(filters: PurchaseApplyFilters): Promise<PurchasePoDetail[]> {
    const result = await this.client().query({
      sql: OPEN_PO_SQL,
      params: [
        orNull(filters.partNum),
        likeOrNull(filters.partDescription),
        orNull(filters.requiredFrom),
        orNull(filters.requiredTo),
        areaToWarehouse(filters.area),
      ],
      maxRows: SEARCH_PROBE_LIMIT,
    });
    return rowsOf(result).map((row, index) => ({
      id: text(row["id"]) || String(index + 1),
      partNum: text(row["partNum"]),
      area: areaFromWarehouse(text(row["warehouse"])),
      applyDate: dateText(row["applyDate"]),
      requiredDate: dateText(row["requiredDate"]),
      openQty: num(row["openQty"]),
      supplierName: text(row["supplierName"]),
      poNum: text(row["poNum"]),
      netSize: text(row["netSize"]) || "未维护",
    }));
  }

  private async queryInventories(filters: PurchaseApplyFilters): Promise<PurchaseInventoryDetail[]> {
    const result = await this.client().query({
      sql: INVENTORY_SQL,
      params: [
        orNull(filters.partNum),
        likeOrNull(filters.partDescription),
        areaToWarehouse(filters.area),
      ],
      maxRows: SEARCH_PROBE_LIMIT,
    });
    return rowsOf(result).map((row, index) => ({
      id: text(row["id"]) || String(index + 1),
      partNum: text(row["partNum"]),
      warehouse: text(row["warehouse"]),
      bin: text(row["bin"]),
      onHandQty: num(row["onHandQty"]),
      reservedQty: num(row["reservedQty"]),
      availableQty: num(row["availableQty"]),
    }));
  }

  private client(): QueryClient {
    return this.queryClient ?? getErpSqlQueryClient();
  }
}

export function parsePurchaseApplyFilters(input: Partial<PurchaseApplyFilters>): PurchaseApplyFilters {
  return {
    ...DEFAULT_FILTERS,
    ...input,
    area: input.area === "总厂" || input.area === "澄江" ? input.area : "",
    demandOnly: input.demandOnly !== false,
  };
}

export function buildPurchaseApplyPreview(input: PurchaseApplyPreviewRequest): PurchaseApplyPreviewResult {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const errors = validatePurchaseApplyRows(rows);
  const buyerId = clean(input.buyerId);
  const taxRegionCode = clean(input.taxRegionCode);
  const orderDate = clean(input.orderDate) || new Date().toISOString().slice(0, 10);
  const userId = clean(input.userId);
  if (!buyerId) errors.push("buyerId is required");
  if (!taxRegionCode) errors.push("taxRegionCode is required");
  if (!userId) errors.push("userId is required");

  const groups = new Map<string, PurchaseApplyPreviewGroup>();
  for (const row of rows) {
    const vendorId = clean(row.vendorId);
    if (!vendorId) continue;
    const group = groups.get(vendorId) ?? {
      vendorId,
      vendorNum: clean(row.vendorNum),
      supplierName: clean(row.supplierName),
      buyerId,
      orderDate,
      taxRegionCode,
      userId,
      autoPo: true,
      details: [],
    };
    group.details.push({
      partNum: clean(row.partNum),
      ourQty: row.orderQty,
      vendQty: row.orderQty,
      pieces: row.pieces,
      ium: clean(row.unit),
      pum: clean(row.unit),
      dueDate: clean(row.arrivalDate),
      commentText: clean(row.remark),
      baseType: row.baseType ?? 0,
      cpNum: clean(row.cpNum),
      applyNum: clean(row.applyNum),
      applyLine: clean(row.applyLine),
      area: row.area,
      price: finiteOrUndefined(row.price),
      maxPrice: finiteOrUndefined(row.maxPrice),
      minPrice: finiteOrUndefined(row.minPrice),
    });
    groups.set(vendorId, group);
  }

  return { ok: errors.length === 0, errors, groups: [...groups.values()] };
}

export function validatePurchaseApplyRows(rows: PurchaseApplyRow[]): string[] {
  const errors: string[] = [];
  if (rows.length === 0) errors.push("rows is required");
  rows.forEach((row, index) => {
    const label = `rows[${index}]`;
    if (!clean(row.partNum)) errors.push(`${label}.partNum is required`);
    if (!clean(row.vendorId)) errors.push(`${label}.vendorId is required`);
    if (!clean(row.unit)) errors.push(`${label}.unit is required`);
    if (!clean(row.arrivalDate)) errors.push(`${label}.arrivalDate is required`);
    if (!Number.isFinite(row.orderQty) || row.orderQty <= 0) errors.push(`${label}.orderQty must be greater than 0`);
    if (!Number.isFinite(row.pieces) || row.pieces <= 0) errors.push(`${label}.pieces must be greater than 0`);
    if (!clean(row.applyNum)) errors.push(`${label}.applyNum is required for ERP write`);
    if (!clean(row.applyLine)) errors.push(`${label}.applyLine is required for ERP write`);
  });
  return errors;
}

export function erpPurchaseApplyContract(): ErpPurchaseApplyContract {
  return {
    requiredEndpoints: [
      { method: "POST", path: "/purchase/apply/orders/preview", purpose: "校验将要生成的采购订单" },
      { method: "POST", path: "/purchase/apply/orders", purpose: "按供应商生成采购订单并回写申请来源" },
      { method: "GET", path: "/purchase/apply/orders/:jobId", purpose: "查询队列式提交结果" },
    ],
    previewPayload: ["buyerId", "orderDate", "vendorId", "taxRegionCode", "userId", "autoPo=true", "details[]"],
    detailPayload: [
      "partNum",
      "ourQty",
      "vendQty",
      "pieces",
      "ium",
      "pum",
      "dueDate",
      "commentText",
      "baseType",
      "cpNum",
      "applyNum",
      "applyLine",
      "area",
      "price?",
      "maxPrice?",
      "minPrice?",
    ],
    notes: [
      "真实提交必须返回结构化 JSON，不能只返回字符串。",
      "必须支持 idempotencyKey，避免重复点击生成重复 PO。",
      "失败时必须回滚已创建 PO，或返回待人工处理状态和错误行。",
    ],
  };
}

function buildRows(
  sources: PurchaseSourceDetail[],
  pos: PurchasePoDetail[],
  inventories: PurchaseInventoryDetail[],
  filters: PurchaseApplyFilters,
): PurchaseApplyRow[] {
  const byKey = new Map<string, PurchaseApplyRow>();
  const stockQtyByPart = sumBy(inventories, (item) => item.partNum, (item) => item.availableQty);
  const openQtyByPart = sumBy(pos, (item) => item.partNum, (item) => item.openQty);
  for (const source of sources) {
    const stockQty = stockQtyByPart.get(source.partNum) ?? 0;
    const openQty = openQtyByPart.get(source.partNum) ?? 0;
    const orderQty = Math.max(0, source.balanceQty - stockQty - openQty);
    if (filters.demandOnly && orderQty <= 0) continue;
    const key = `${source.partNum}:${source.area}`;
    const current = byKey.get(key);
    if (current) {
      current.requiredQty += source.balanceQty;
      current.orderQty += orderQty;
      continue;
    }
    byKey.set(key, {
      id: key,
      selected: false,
      operated: false,
      partNum: source.partNum,
      partDescription: "",
      needDrawing: false,
      smallBatch: false,
      requiredQty: source.balanceQty,
      orderQty,
      monthlyUsage: 0,
      unit: "",
      arrivalDate: source.requiredDate,
      packageSpec: 1,
      pieces: Math.max(1, Math.ceil(orderQty)),
      purchaseCycle: 0,
      area: source.area === "澄江" ? "澄江" : "总厂",
      stockLevel: orderQty > 0 ? "需求" : "库存/在途覆盖",
      remark: "",
      stockQty,
      supplierName: "",
      vendorId: "",
      vendorNum: "",
    });
  }
  return [...byKey.values()];
}

function sumBy<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    totals.set(key, (totals.get(key) ?? 0) + valueOf(item));
  }
  return totals;
}

function limitRows<T>(rows: T[]): T[] {
  return rows.length > SEARCH_ROW_LIMIT ? rows.slice(0, SEARCH_ROW_LIMIT) : rows;
}

function truncationWarnings(label: string, rows: unknown[]): string[] {
  return rows.length > SEARCH_ROW_LIMIT ? [`${label}超过 ${SEARCH_ROW_LIMIT} 行，已截断；请缩小筛选条件。`] : [];
}

function rowsOf(result: ErpSqlQueryResult): RowRecord[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.fields.map((field, index) => [field, Array.isArray(row) ? row[index] : undefined])),
  );
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function clean(value: unknown): string {
  return text(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(value: unknown): string {
  return text(value).slice(0, 10);
}

function finiteOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function orNull(value: string): string | null {
  return clean(value) || null;
}

function likeOrNull(value: string): string | null {
  const cleaned = clean(value);
  return cleaned ? `%${cleaned}%` : null;
}

function areaToWarehouse(area: PurchaseApplyFilters["area"]): string | null {
  if (area === "澄江") return "CJ%";
  if (area === "总厂") return "ZC%";
  return null;
}

function areaFromWarehouse(warehouse: string): "总厂" | "澄江" {
  return warehouse.toUpperCase().startsWith("CJ") ? "澄江" : "总厂";
}

const SOURCE_SQL = `
SELECT TOP 501
  CONCAT(jm.JobNum, '-', jm.AssemblySeq, '-', jm.MtlSeq) AS id,
  jm.PartNum AS partNum,
  COALESCE(jm.WarehouseCode, jh.Plant, '') AS warehouse,
  jm.JobNum AS jobNum,
  jm.ReqDate AS requiredDate,
  jm.RequiredQty AS requiredQty,
  jm.IssuedQty AS issuedQty,
  jm.RequiredQty - jm.IssuedQty AS balanceQty
FROM Erp.JobMtl jm
LEFT JOIN Erp.JobHead jh ON jh.Company = jm.Company AND jh.JobNum = jm.JobNum
LEFT JOIN Erp.Part p ON p.Company = jm.Company AND p.PartNum = jm.PartNum
WHERE (@p1 IS NULL OR jm.PartNum = @p1)
  AND (@p2 IS NULL OR p.PartDescription LIKE @p2)
  AND (@p3 IS NULL OR jm.JobNum = @p3)
  AND (@p4 IS NULL OR jm.ReqDate >= @p4)
  AND (@p5 IS NULL OR jm.ReqDate <= @p5)
  AND (@p6 IS NULL OR COALESCE(jm.WarehouseCode, jh.Plant, '') LIKE @p6)
  AND (@p7 = 0 OR jm.RequiredQty > jm.IssuedQty)
ORDER BY jm.ReqDate, jm.PartNum`;

const OPEN_PO_SQL = `
SELECT TOP 501
  CONCAT(pod.PONum, '-', pod.POLine, '-', por.PORelNum) AS id,
  pod.PartNum AS partNum,
  COALESCE(por.WarehouseCode, '') AS warehouse,
  poh.OrderDate AS applyDate,
  COALESCE(por.PromiseDt, por.DueDate) AS requiredDate,
  por.XRelQty - COALESCE(rcv.receivedQty, 0) AS openQty,
  v.Name AS supplierName,
  poh.PONum AS poNum,
  COALESCE(pod.Character01, '') AS netSize
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod ON pod.Company = poh.Company AND pod.PONum = poh.PONum
INNER JOIN Erp.PORel por ON por.Company = pod.Company AND por.PONum = pod.PONum AND por.POLine = pod.POLine
LEFT JOIN Erp.Vendor v ON v.Company = poh.Company AND v.VendorNum = poh.VendorNum
LEFT JOIN (
  SELECT Company, PONum, POLine, PORelNum, SUM(OurQty) AS receivedQty
  FROM Erp.RcvDtl
  GROUP BY Company, PONum, POLine, PORelNum
) rcv ON rcv.Company = por.Company AND rcv.PONum = por.PONum AND rcv.POLine = por.POLine AND rcv.PORelNum = por.PORelNum
WHERE (@p1 IS NULL OR pod.PartNum = @p1)
  AND (@p2 IS NULL OR pod.LineDesc LIKE @p2)
  AND (@p3 IS NULL OR COALESCE(por.PromiseDt, por.DueDate) >= @p3)
  AND (@p4 IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= @p4)
  AND (@p5 IS NULL OR COALESCE(por.WarehouseCode, '') LIKE @p5)
  AND por.XRelQty > COALESCE(rcv.receivedQty, 0)
ORDER BY COALESCE(por.PromiseDt, por.DueDate), pod.PartNum`;

const INVENTORY_SQL = `
SELECT TOP 501
  CONCAT(pb.PartNum, '-', pb.WarehouseCode, '-', pb.BinNum) AS id,
  pb.PartNum AS partNum,
  pb.WarehouseCode AS warehouse,
  pb.BinNum AS bin,
  COALESCE(pb.OnhandQty, pw.OnHandQty, 0) AS onHandQty,
  0 AS reservedQty,
  COALESCE(pb.OnhandQty, pw.OnHandQty, 0) AS availableQty
FROM Erp.PartBin pb
LEFT JOIN Erp.PartWhse pw ON pw.Company = pb.Company AND pw.PartNum = pb.PartNum AND pw.WarehouseCode = pb.WarehouseCode
LEFT JOIN Erp.Part p ON p.Company = pb.Company AND p.PartNum = pb.PartNum
WHERE (@p1 IS NULL OR pb.PartNum = @p1)
  AND (@p2 IS NULL OR p.PartDescription LIKE @p2)
  AND (@p3 IS NULL OR pb.WarehouseCode LIKE @p3)
  AND COALESCE(pb.OnhandQty, pw.OnHandQty, 0) <> 0
ORDER BY pb.PartNum, pb.WarehouseCode, pb.BinNum`;

export const purchaseApplyService = new PurchaseApplyService();
