import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getErpSqlQueryClient, type ErpSqlQueryOptions, type ErpSqlQueryResult } from "../erpSqlAgent/query/index.js";
import { prisma } from "../../lib/prisma.js";
import { summarizeArchiveColumns, summarizeArchiveItems } from "./archive/archiveFields.js";
import { ProductConfigErpIdentityLookupService, type ErpIdentityCandidate } from "./erpIdentityLookup.service.js";

const LEDGER_RULE_VERSION = "erp-identity-ledger-v1.0";
const EXPECTED_DISCOVERY_RULE_VERSION = "product-package-discovery-v3.0";

type InputRow = Record<string, string>;
type FinalStatus = "matched" | "ambiguous" | "unresolved" | "failed";

export type ErpIdentityLedgerAuditOptions = {
  inputDir: string;
  outputDir: string;
  onProgress?: (message: string) => void;
};

type ItemEvidence = {
  itemIndex: string;
  itemName: string;
  productNumber: string;
  quantity: string;
  source: string;
};

type LinkRow = InputRow & {
  evidence_item_index: string;
  evidence_source: string;
  evidence_product_number: string;
  evidence_order_number: string;
  identity_status: FinalStatus;
  confidence: string;
  company: string;
  part_num: string;
  prod_code: string;
  prod_group: string;
  class_id: string;
  part_class: string;
  has_bom: string;
  erp_order_num: string;
  erp_order_line: string;
  reasons: string;
  alternatives: string;
  erp_family_consistency: "consistent" | "conflict" | "unknown";
  blocker: string;
};

class CachedErpQueryClient {
  private readonly client = getErpSqlQueryClient();
  private readonly cache = new Map<string, Promise<ErpSqlQueryResult>>();
  calls = 0;
  cacheHits = 0;
  truncated = 0;
  failures = 0;

  query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult> {
    const key = JSON.stringify(options);
    const cached = this.cache.get(key);
    if (cached) {
      this.cacheHits += 1;
      return cached;
    }
    this.calls += 1;
    const pending = this.client.query(options).then((result) => {
      if (result.truncated) this.truncated += 1;
      return result;
    }).catch((error) => {
      this.failures += 1;
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, pending);
    return pending;
  }
}

export async function runErpIdentityLedgerAudit(options: ErpIdentityLedgerAuditOptions) {
  const progress = options.onProgress ?? (() => undefined);
  const packagePath = path.join(options.inputDir, "document-product-packages.tsv");
  const productPath = path.join(options.inputDir, "document-products.tsv");
  const discoverySummaryPath = path.join(options.inputDir, "summary.json");
  const packages = readTsv(packagePath);
  const products = readTsv(productPath);
  const discoverySummary = JSON.parse(fs.readFileSync(discoverySummaryPath, "utf8"));
  validateInput(packages, products, discoverySummary);

  const documentIds = packages.map((row) => BigInt(row.document_id));
  progress(`stage=load_evidence processed=0/${packages.length}`);
  const [documents, archives, archiveItems, extractions] = await Promise.all([
    prisma.productDocument.findMany({ where: { id: { in: documentIds } }, select: { id: true, fileName: true } }),
    prisma.contractArchive.findMany({
      where: { documentId: { in: documentIds } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, documentId: true, orderNumber: true, contractNumber: true },
    }),
    prisma.contractArchiveItem.findMany({
      where: { documentId: { in: documentIds } },
      select: { documentId: true, itemIndex: true, itemName: true, itemQuantity: true, sourceProductNumber: true, productNumberStatus: true },
    }),
    prisma.extractionResult.findMany({
      where: { documentId: { in: documentIds } },
      orderBy: [{ documentId: "asc" }, { createdAt: "desc" }],
      select: { documentId: true, normalizedExtractionJson: true, extractionJson: true, llmPlanJson: true },
    }),
  ]);

  const documentById = new Map(documents.map((row) => [String(row.id), row]));
  const archiveByDocument = firstByDocument(archives);
  const archiveItemsByDocument = groupByDocument(archiveItems);
  const latestExtraction = firstByDocument(extractions);
  const productsByDocument = new Map<string, InputRow[]>();
  for (const row of products) productsByDocument.set(row.document_id, [...(productsByDocument.get(row.document_id) ?? []), row]);

  const queryClient = new CachedErpQueryClient();
  const identityService = new ProductConfigErpIdentityLookupService(queryClient);
  const links: LinkRow[] = [];
  const packageSummaries: InputRow[] = [];
  const counts: Record<FinalStatus, number> = { matched: 0, ambiguous: 0, unresolved: 0, failed: 0 };

  for (let packageIndex = 0; packageIndex < packages.length; packageIndex += 1) {
    const packageRow = packages[packageIndex];
    const packageProducts = productsByDocument.get(packageRow.document_id) ?? [];
    const archive = archiveByDocument.get(packageRow.document_id);
    const extraction = latestExtraction.get(packageRow.document_id);
    const normalized = extraction?.normalizedExtractionJson ?? {};
    const normalizedColumns = summarizeArchiveColumns(normalized);
    const orderNumber = exactOrderNumber(archive?.orderNumber) ?? exactOrderNumber(normalizedColumns.orderNumber);
    const evidenceItems = collectItemEvidence(
      archiveItemsByDocument.get(packageRow.document_id) ?? [],
      normalized,
      extraction?.extractionJson,
      extraction?.llmPlanJson,
    );
    const fileTokens = sixDigitTokens(documentById.get(packageRow.document_id)?.fileName);
    let packageLinks: LinkRow[];

    try {
      if (!packageProducts.length) {
        packageLinks = [];
      } else {
        const linkedEvidence = packageProducts.map((row) => evidenceForProduct(row, packageProducts, evidenceItems, fileTokens));
        const result = await identityService.linkPackage({
          orderNumber: orderNumber ?? undefined,
          items: packageProducts.map((row, index) => ({
            itemKey: `${row.document_id}:${row.package_item_order}`,
            productName: row.product_name,
            productNumber: linkedEvidence[index].productNumber || undefined,
            expectedProdCodes: splitList(row.expected_erp_prod_codes),
            quantity: linkedEvidence[index].quantity || undefined,
          })),
          limit: 30,
        });
        packageLinks = packageProducts.map((row, index) => {
          const evidence = linkedEvidence[index];
          const resolution = result.resolutions[index];
          const status = resolution?.status ?? "unresolved";
          const blocker = blockerFor(status, Boolean(orderNumber), evidence, fileTokens, resolution?.reasons ?? []);
          return linkRow(row, evidence, orderNumber ?? "", status, resolution?.confidence ?? 0,
            resolution?.candidate ?? null, resolution?.alternatives ?? [], resolution?.reasons ?? ["missing_resolution"], blocker);
        });
      }
    } catch (error) {
      const message = safeError(error);
      packageLinks = packageProducts.map((row) => linkRow(row, emptyEvidence(), orderNumber ?? "", "failed", 0, null, [], ["erp_query_failed"], message));
    }

    for (const row of packageLinks) {
      links.push(row);
      counts[row.identity_status] += 1;
    }
    packageSummaries.push({
      document_id: packageRow.document_id,
      input_product_rows: String(packageProducts.length),
      matched: String(packageLinks.filter((row) => row.identity_status === "matched").length),
      ambiguous: String(packageLinks.filter((row) => row.identity_status === "ambiguous").length),
      unresolved: String(packageLinks.filter((row) => row.identity_status === "unresolved").length),
      failed: String(packageLinks.filter((row) => row.identity_status === "failed").length),
      package_status: packageProducts.length ? packageStatus(packageLinks) : "no_product_evidence",
      erp_order_evidence: orderNumber ? "present" : "absent",
      blocker: packageProducts.length ? unique(packageLinks.map((row) => row.blocker).filter(Boolean)).join("|") : "no_product_rows_in_fixed_input",
    });
    if ((packageIndex + 1) % 20 === 0 || packageIndex + 1 === packages.length) {
      progress(`stage=erp_identity processed=${packageIndex + 1}/${packages.length} products=${links.length}/${products.length} matched=${counts.matched} ambiguous=${counts.ambiguous} unresolved=${counts.unresolved} failed=${counts.failed}`);
    }
  }

  if (links.length !== 648 || packageSummaries.length !== 400) throw new Error(`Conservation failed: links=${links.length}, packages=${packageSummaries.length}`);
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== links.length) throw new Error("Terminal status conservation failed.");
  assertNoDuplicateOrderLines(links);

  const issues = links.filter((row) => row.identity_status !== "matched" || row.erp_family_consistency !== "consistent");
  const familyConflicts = links.filter((row) => row.erp_family_consistency === "conflict");
  const inputSnapshot = {
    generatedAt: new Date().toISOString(),
    asOf: discoverySummary.asOf,
    dictionaryVersion: discoverySummary.dictionaryVersion,
    discoveryRuleVersion: discoverySummary.ruleVersion,
    ledgerRuleVersion: LEDGER_RULE_VERSION,
    productRowsSha256: sha256File(productPath),
    packageRowsSha256: sha256File(packagePath),
    discoverySummarySha256: sha256File(discoverySummaryPath),
    expectedProductRows: 648,
    expectedPackages: 400,
  };
  const summary = {
    ...inputSnapshot,
    readOnly: true,
    counts: {
      packages: packageSummaries.length,
      productRows: links.length,
      ...counts,
      familyConsistent: links.filter((row) => row.erp_family_consistency === "consistent").length,
      familyConflicts: familyConflicts.length,
      familyUnknown: links.filter((row) => row.erp_family_consistency === "unknown").length,
      packagesWithoutProductRows: packageSummaries.filter((row) => row.package_status === "no_product_evidence").length,
    },
    erpQueries: {
      calls: queryClient.calls,
      cacheHits: queryClient.cacheHits,
      truncated: queryClient.truncated,
      failures: queryClient.failures,
      processingConcurrency: 1,
    },
    safeguards: { databaseWrites: 0, erpWrites: 0, bomDetailQueries: 0, priceQueries: 0, applyActions: 0 },
  };

  fs.mkdirSync(options.outputDir, { recursive: true });
  writeTsv(path.join(options.outputDir, "erp-identity-links.tsv"), links);
  writeTsv(path.join(options.outputDir, "erp-identity-issues.tsv"), issues);
  writeTsv(path.join(options.outputDir, "erp-family-conflicts.tsv"), familyConflicts);
  writeTsv(path.join(options.outputDir, "package-summary.tsv"), packageSummaries);
  fs.writeFileSync(path.join(options.outputDir, "input-snapshot.json"), `${JSON.stringify(inputSnapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, "report.md"), report(summary, issues));
  progress(`stage=done products=${links.length}/${products.length} matched=${counts.matched} ambiguous=${counts.ambiguous} unresolved=${counts.unresolved} failed=${counts.failed}`);
  return summary;
}

function validateInput(packages: InputRow[], products: InputRow[], summary: any) {
  if (summary.ruleVersion !== EXPECTED_DISCOVERY_RULE_VERSION) throw new Error(`Expected discovery rule ${EXPECTED_DISCOVERY_RULE_VERSION}, got ${summary.ruleVersion}`);
  if (packages.length !== 400 || new Set(packages.map((row) => row.document_id)).size !== 400) throw new Error("Fixed input must contain 400 unique packages.");
  if (products.length !== 648) throw new Error(`Fixed input must contain 648 product rows, got ${products.length}.`);
  if (products.some((row) => !row.document_id || !row.package_item_order)) throw new Error("Product input is missing document_id or package_item_order.");
}

function collectItemEvidence(archiveItems: any[], normalized: unknown, extraction: unknown, plan: unknown): ItemEvidence[] {
  const rows: ItemEvidence[] = archiveItems.map((item) => ({
    itemIndex: String(item.itemIndex ?? ""), itemName: text(item.itemName),
    productNumber: boundProductNumber(item.sourceProductNumber, item.productNumberStatus),
    quantity: text(item.itemQuantity), source: "archive_item",
  }));
  const add = (value: unknown, source: string) => {
    for (const item of summarizeArchiveItems(value)) rows.push({
      itemIndex: String(item.itemIndex), itemName: text(item.itemName),
      productNumber: boundProductNumber(item.sourceProductNumber, item.productNumberStatus),
      quantity: text(item.itemQuantity), source,
    });
  };
  add(normalized, "normalized_item");
  add(object(extraction).extraction ?? extraction, "extraction_item");
  add(plan, "plan_item");
  return rows.filter((row) => row.itemName || row.productNumber);
}

function evidenceForProduct(row: InputRow, packageRows: InputRow[], items: ItemEvidence[], fileTokens: string[]): ItemEvidence {
  const nameMatches = items.filter((item) => item.productNumber && namesMatch(row.product_name, item.itemName));
  const distinctMatches = unique(nameMatches.map((item) => item.productNumber));
  if (distinctMatches.length === 1) {
    const match = nameMatches.find((item) => item.productNumber === distinctMatches[0])!;
    return { ...match, source: `${match.source}:unique_name_match` };
  }
  const allNumbers = unique(items.map((item) => item.productNumber).filter(Boolean));
  if (packageRows.length === 1 && allNumbers.length === 1) {
    const match = items.find((item) => item.productNumber === allNumbers[0])!;
    return { ...match, source: `${match.source}:single_package_item` };
  }
  if (packageRows.length === 1 && fileTokens.length === 1) {
    return { itemIndex: "", itemName: row.product_name, productNumber: fileTokens[0], quantity: "", source: "file_name_single_six_digit_part_candidate" };
  }
  return emptyEvidence();
}

function linkRow(row: InputRow, evidence: ItemEvidence, orderNumber: string, status: FinalStatus, confidence: number,
  candidate: ErpIdentityCandidate | null, alternatives: ErpIdentityCandidate[], reasons: string[], blocker: string): LinkRow {
  const expected = splitList(row.expected_erp_prod_codes);
  const consistency = status !== "matched" || !candidate?.prodCode || !expected.length
    ? "unknown"
    : expected.includes(candidate.prodCode) ? "consistent" : "conflict";
  const finalBlocker = blocker || (consistency === "conflict"
    ? "matched_identity_erp_family_conflict_requires_review"
    : status === "matched" && consistency === "unknown" ? "matched_identity_has_no_comparable_erp_family" : "");
  return {
    ...row,
    evidence_item_index: evidence.itemIndex,
    evidence_source: evidence.source,
    evidence_product_number: evidence.productNumber,
    evidence_order_number: orderNumber,
    identity_status: status,
    confidence: confidence.toFixed(2),
    company: text(candidate?.company),
    part_num: text(candidate?.productNumber),
    prod_code: text(candidate?.prodCode),
    prod_group: text(candidate?.prodGroupName),
    class_id: text(candidate?.classId),
    part_class: text(candidate?.className),
    has_bom: candidate ? String(candidate.hasBom) : "",
    erp_order_num: text(candidate?.orderNumber),
    erp_order_line: text(candidate?.orderLine),
    reasons: reasons.join("|"),
    alternatives: JSON.stringify(alternatives.map((item) => ({ company: item.company, partNum: item.productNumber, prodCode: item.prodCode, classId: item.classId, hasBom: item.hasBom, orderNum: item.orderNumber, orderLine: item.orderLine }))),
    erp_family_consistency: consistency,
    blocker: finalBlocker,
  };
}

function blockerFor(status: FinalStatus, hasOrder: boolean, evidence: ItemEvidence, fileTokens: string[], reasons: string[]): string {
  if (status === "matched") return "";
  if (reasons.includes("name_or_family_hint_only")) return "name_or_family_hint_is_not_identity_evidence";
  if (evidence.productNumber && reasons.includes("candidate_gap_too_small")) return "part_num_exists_in_multiple_companies_or_candidates";
  if (!evidence.productNumber && !hasOrder && fileTokens.length > 0) return "document_level_part_candidate_not_assignable_to_family_row";
  if (!evidence.productNumber && !hasOrder) return "family_row_has_no_exact_item_index_part_num_or_erp_order_num";
  return "erp_candidates_not_decisive";
}

function assertNoDuplicateOrderLines(rows: LinkRow[]) {
  const seen = new Set<string>();
  for (const row of rows.filter((item) => item.identity_status === "matched" && item.company && item.erp_order_num && item.erp_order_line)) {
    const key = `${row.document_id}:${row.company}:${row.erp_order_num}:${row.erp_order_line}`;
    if (seen.has(key)) throw new Error(`Duplicate ERP order line assignment: ${key}`);
    seen.add(key);
  }
}

function packageStatus(rows: LinkRow[]): string {
  if (rows.some((row) => row.identity_status === "failed")) return "failed";
  if (rows.every((row) => row.identity_status === "matched")) return "fully_matched";
  if (rows.some((row) => row.identity_status === "matched")) return "partially_matched";
  if (rows.some((row) => row.identity_status === "ambiguous")) return "ambiguous";
  return "unresolved";
}

function report(summary: any, issues: LinkRow[]): string {
  const blockers = new Map<string, number>();
  for (const row of issues) blockers.set(row.blocker || "other", (blockers.get(row.blocker || "other") ?? 0) + 1);
  const blockerLines = [...blockers.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  return `# 阶段 2.1：400份报价包 ERP 身份关联总账\n\n本次固定输入为 product-package-discovery-v3.0 的400份报价包、648条产品族记录。全程只读。\n\n## 结果\n\n- matched: ${summary.counts.matched}\n- ambiguous: ${summary.counts.ambiguous}\n- unresolved: ${summary.counts.unresolved}\n- failed: ${summary.counts.failed}\n- ERP family一致/冲突/未知: ${summary.counts.familyConsistent}/${summary.counts.familyConflicts}/${summary.counts.familyUnknown}\n- ERP查询/缓存命中/截断/失败: ${summary.erpQueries.calls}/${summary.erpQueries.cacheHits}/${summary.erpQueries.truncated}/${summary.erpQueries.failures}\n\n## 主要 blocker\n\n${blockerLines || "- 无"}\n\n## 边界\n\n名称与 expected ProdCode 只用于候选排序，不单独构成 matched。身份键为 Company + PartNum；跨Company未消歧保持 ambiguous。未查询价格或BOM明细，未写数据库或ERP，未运行 normalization、refresh、worker、job 或业务LLM。\n`;
}

function readTsv(filePath: string): InputRow[] {
  const lines = fs.readFileSync(filePath, "utf8").trimEnd().split(/\r?\n/u);
  const headers = lines.shift()?.split("\t") ?? [];
  return lines.filter(Boolean).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split("\t")[index] ?? ""])));
}

function writeTsv(filePath: string, rows: InputRow[]) {
  const headers = rows.length ? Object.keys(rows[0]) : ["document_id"];
  const clean = (value: unknown) => String(value ?? "").replace(/[\t\r\n]+/gu, " ");
  fs.writeFileSync(filePath, `${headers.join("\t")}\n${rows.map((row) => headers.map((header) => clean(row[header])).join("\t")).join("\n")}\n`);
}

function firstByDocument<T extends { documentId: bigint | null }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) if (row.documentId !== null && !result.has(String(row.documentId))) result.set(String(row.documentId), row);
  return result;
}

function groupByDocument<T extends { documentId: bigint | null }>(rows: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) if (row.documentId !== null) result.set(String(row.documentId), [...(result.get(String(row.documentId)) ?? []), row]);
  return result;
}

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown): string { return value === null || value === undefined ? "" : String(value).trim(); }
function splitList(value: unknown): string[] { return text(value).split(/[|,，;；]/u).map((item) => item.trim()).filter(Boolean); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function singleProductNumber(value: unknown): string { const found = text(value); return found && !/[、,，;；\s]+/u.test(found) ? found : ""; }
export function boundProductNumber(value: unknown, status: unknown): string { return status === "bound" ? singleProductNumber(value) : ""; }
function exactOrderNumber(value: unknown): string | null { const found = text(value); return /^\d+$/u.test(found) ? found : null; }
function sixDigitTokens(value: unknown): string[] { return unique(text(value).match(/(?<!\d)\d{6}(?!\d)/gu) ?? []); }
function normalizeName(value: unknown): string { return text(value).normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
function namesMatch(left: unknown, right: unknown): boolean { const a = normalizeName(left); const b = normalizeName(right); return a.length >= 2 && b.length >= 2 && (a === b || a.includes(b) || b.includes(a)); }
function emptyEvidence(): ItemEvidence { return { itemIndex: "", itemName: "", productNumber: "", quantity: "", source: "" }; }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\t\r\n]+/gu, " ").slice(0, 240); }

export { LEDGER_RULE_VERSION };
