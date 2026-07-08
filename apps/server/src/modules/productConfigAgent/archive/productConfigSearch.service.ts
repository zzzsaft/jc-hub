import { prisma } from "../../../lib/prisma.js";

export type ProductConfigSearchParams = {
  productNumber: string;
  customerId?: string;
  includeErp?: boolean;
};

export type ProductConfigMatch = {
  archiveId: number | null;
  documentId: number | null;
  extractionResultId: number | null;
  fileName: unknown;
  itemId: number | null;
  itemIndex: number | null;
  itemName: unknown;
  itemProductTypeHint: unknown;
  sourceProductNumber: unknown;
  productBinding: Record<string, unknown>;
  customerId: unknown;
  configFields: unknown[];
  erpProduct: Record<string, unknown> | null;
  matchStatus: "erp_matched" | "archive_only";
  score: number;
  warnings: string[];
};

export class ProductConfigSearchService {
  async searchProductConfigs(params: ProductConfigSearchParams) {
    const productNumber = normalizeOptionalString(params.productNumber);
    if (!productNumber) throw new Error("productNumber is required");

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `select
         binding.id as binding_id,
         binding.product_number,
         binding.role,
         binding.quantity,
         binding.binding_source,
         binding.confidence,
         binding.erp_product_id,
         binding.erp_parent_product_number,
         binding.erp_match_status,
         binding.evidence_json,
         binding.note,
         item.id as item_id,
         item.item_index,
         item.item_name,
         item.product_type_hint,
         item.source_product_number,
         item.fields_json,
         archive.id as archive_id,
         archive.document_id,
         archive.extraction_result_id,
         archive.customer_id,
         document.file_name
       from agent.contract_archive_item_products binding
       inner join agent.contract_archive_items item on item.id = binding.archive_item_id
       inner join agent.contract_archives archive on archive.id = binding.archive_id
       left join agent.documents document on document.id = archive.document_id
       where binding.product_number ilike $1
         and archive.status = 'archived'
         and coalesce(archive.dirty_reason, '') <> 'duplicate_archive_not_refreshed'
         and ($2::text is null or archive.customer_id = $2::text)
       order by archive.updated_at desc, item.item_index asc`,
      `%${productNumber}%`,
      normalizeOptionalString(params.customerId) ?? null,
    );

    return {
      source: "archive_product_configs",
      productNumber,
      includeErp: params.includeErp === true,
      erpSearchEnabled: false,
      sources: { archiveBindings: true, erp: false },
      matches: rows.map(mapProductConfigMatch),
    };
  }
}

export const productConfigSearchService = new ProductConfigSearchService();

export function mapProductConfigMatch(row: any): ProductConfigMatch {
  const match = {
    archiveId: numberOrNull(row.archive_id),
    documentId: numberOrNull(row.document_id),
    extractionResultId: numberOrNull(row.extraction_result_id),
    fileName: row.file_name ?? null,
    itemId: numberOrNull(row.item_id),
    itemIndex: numberOrNull(row.item_index),
    itemName: row.item_name ?? null,
    itemProductTypeHint: row.product_type_hint ?? null,
    sourceProductNumber: row.source_product_number ?? null,
    productBinding: {
      id: numberOrNull(row.binding_id),
      productNumber: row.product_number,
      role: row.role,
      quantity: row.quantity,
      bindingSource: row.binding_source,
      confidence: row.confidence,
      erpProductId: row.erp_product_id,
      erpParentProductNumber: row.erp_parent_product_number,
      erpMatchStatus: row.erp_match_status,
      evidence: row.evidence_json,
      note: row.note,
    },
    customerId: row.customer_id ?? null,
    configFields: Array.isArray(row.fields_json) ? row.fields_json : [],
    erpProduct: row.erp_product_id
      ? {
          id: row.erp_product_id,
          productNumber: row.product_number,
          parentProductNumber: row.erp_parent_product_number,
        }
      : null,
    matchStatus: row.erp_product_id ? "erp_matched" as const : "archive_only" as const,
  };
  return {
    ...match,
    score: scoreProductConfigMatch(match),
    warnings: productConfigMatchWarnings(match),
  };
}

export function scoreProductConfigMatch(match: any): number {
  let score = 0.45;
  if (match.productBinding?.productNumber) score += 0.25;
  if (match.productBinding?.confidence !== null && match.productBinding?.confidence !== undefined) {
    score += Math.max(0, Math.min(0.15, Number(match.productBinding.confidence) * 0.15));
  }
  if (match.customerId) score += 0.08;
  if (match.itemProductTypeHint && match.itemProductTypeHint !== "unknown") score += 0.05;
  if (match.erpProduct) score += 0.07;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function productConfigMatchWarnings(match: any): string[] {
  const warnings: string[] = [];
  if (!match.customerId) warnings.push("archive match has no customerId");
  if (!match.itemProductTypeHint || match.itemProductTypeHint === "unknown") warnings.push("archive match has unknown product type");
  if (!match.erpProduct) warnings.push("archive match has no ERP binding");
  return warnings;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
