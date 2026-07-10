import crypto from "node:crypto";
import path from "node:path";
import {
  classifyProductItemRole,
  resolveProductType,
  type ProductItemRole,
  type ProductTypeDefinition,
  type ProductTypeResolution,
} from "./resolver.js";
import { classifyDieConfiguration, type DieConfigurationDecision } from "./dieConfiguration.js";

export const PRODUCT_TYPE_DISCOVERY_RULE_VERSION = "product-package-discovery-v3.0";
export const PRODUCT_TYPE_DISCOVERY_SEED = "product-package-discovery-400-v3.0-2026-07-10";

const SENSITIVE = /文件名|客户|联系人|联系电话|手机号|电话号码|地址|有限公司|股份有限公司|公司名称/i;
const PRODUCT_SHAPE = /(?:机|器|仪|泵|阀|模头|模具|系统|装置|箱|板|管道|小车|罩)$/u;
const SOURCE_WEIGHT: Record<string, number> = {
  labeled_block: 100,
  title_internal: 90,
  section_heading: 80,
  normalized_item: 74,
  plan_item: 70,
  extraction_item: 68,
};

export type DiscoveryMetadata = {
  documentId: bigint;
  createdAt: Date;
  hasPlan: boolean;
  archiveOrderDate?: Date | null;
  archiveDocInfo?: unknown;
  blockDateLabel?: string | null;
  blockDateValue?: string | null;
};

export type BusinessDate = {
  value: string;
  source: "archive_order_date_or_doc_info" | "blocks_validated_business_date" | "document_created_at_import_fallback";
  confidence: "high" | "medium" | "low";
  explicit: boolean;
  rejectedReason: string;
};

export type DiscoverySample = DiscoveryMetadata & {
  businessDate: BusinessDate;
  sampleClass: string;
};

export type DiscoveryDetail = {
  documentId: bigint;
  fileName: string | null;
  blocksJson: unknown;
  planJson: unknown;
  extractionJson: unknown;
  normalizedExtractionJson: unknown;
};

export type ProductEvidence = {
  raw: string;
  source: keyof typeof SOURCE_WEIGHT;
};

export type ProductObservation = ProductEvidence & {
  resolution: ProductTypeResolution | null;
  role: ProductItemRole;
  candidateKey: string;
};

export type DocumentProductPackageItem = DieConfigurationDecision & {
  productName: string;
  productFamily: string;
  productDisplayName: string;
  itemRole: "main_product" | "system";
  resolutionMethod: string;
  evidenceSources: string;
  ruleConfidence: number;
  candidateKey: string;
  newProductTypeCandidate: boolean;
};

export type DocumentProductDecision = DieConfigurationDecision & {
  documentId: bigint;
  primaryName: string;
  productFamily: string;
  itemRole: "main_product" | "system" | "unresolved";
  resolutionMethod: string;
  evidenceSources: string;
  secondaryProducts: string;
  rejectedComponents: string;
  ruleConfidence: number;
  conflictEvidence: string;
  newProductTypeCandidate: boolean;
  unresolvedReason: string;
  packageItems: DocumentProductPackageItem[];
  observations: ProductObservation[];
};

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function safeProductText(value: unknown): string {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return !cleaned || cleaned.length > 120 || SENSITIVE.test(cleaned) ? "" : cleaned;
}

function parseIsoDate(value: unknown): string {
  if (!value) return "";
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).replace(/[年月/.]/g, "-").replace(/日/g, "");
  const match = raw.match(/((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return "";
  return date.toISOString().slice(0, 10);
}

function docInfoDate(value: unknown): string {
  const record = object(value);
  for (const key of ["orderDate", "order_date", "documentDate", "document_date", "contractDate", "contract_date"]) {
    const found = parseIsoDate(record[key]);
    if (found) return found;
  }
  for (const child of Object.values(record)) {
    if (!child || typeof child !== "object" || Array.isArray(child)) continue;
    const found = docInfoDate(child);
    if (found) return found;
  }
  return "";
}

export function deriveBusinessDate(row: DiscoveryMetadata, asOf: string): BusinessDate {
  const rejected: string[] = [];
  const archive = parseIsoDate(row.archiveOrderDate) || docInfoDate(row.archiveDocInfo);
  if (archive && archive <= asOf) return { value: archive, source: "archive_order_date_or_doc_info", confidence: "high", explicit: true, rejectedReason: "" };
  if (archive > asOf) rejected.push(`future_archive_date:${archive}`);

  const validBlockLabel = /^(?:订单日期|下单日期|制单日期|签订日期|合同日期)$/u.test(String(row.blockDateLabel ?? "").trim());
  const blockCandidate = parseIsoDate(row.blockDateValue);
  const block = validBlockLabel ? blockCandidate : "";
  if (block && block <= asOf) return { value: block, source: "blocks_validated_business_date", confidence: "medium", explicit: true, rejectedReason: rejected.join("|") };
  if (block > asOf) rejected.push(`future_blocks_date:${block}`);
  if (row.blockDateValue && !validBlockLabel) {
    rejected.push("invalid_blocks_date_label");
    if (blockCandidate > asOf) rejected.push(`future_blocks_date:${blockCandidate}`);
  }

  return {
    value: row.createdAt.toISOString().slice(0, 10),
    source: "document_created_at_import_fallback",
    confidence: "low",
    explicit: false,
    rejectedReason: rejected.join("|"),
  };
}

function stableHash(value: string, seed = PRODUCT_TYPE_DISCOVERY_SEED): string {
  return crypto.createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

export function selectDiscoverySamples(
  metadata: DiscoveryMetadata[],
  asOf: string,
  quotas = { recent_explicit_no_plan: 180, recent_explicit_has_plan: 80, no_explicit_date_no_plan: 100, no_explicit_date_has_plan: 40 },
): { samples: DiscoverySample[]; shortfalls: Record<string, number> } {
  const rows = metadata.map((row) => ({ ...row, businessDate: deriveBusinessDate(row, asOf) }));
  const pools: Record<string, typeof rows> = {
    recent_explicit_no_plan: rows.filter((row) => row.businessDate.explicit && !row.hasPlan).sort((a, b) => b.businessDate.value.localeCompare(a.businessDate.value)).slice(0, 8000),
    recent_explicit_has_plan: rows.filter((row) => row.businessDate.explicit && row.hasPlan).sort((a, b) => b.businessDate.value.localeCompare(a.businessDate.value)).slice(0, 8000),
    no_explicit_date_no_plan: rows.filter((row) => !row.businessDate.explicit && !row.hasPlan).sort((a, b) => b.businessDate.value.localeCompare(a.businessDate.value)).slice(0, 8000),
    no_explicit_date_has_plan: rows.filter((row) => !row.businessDate.explicit && row.hasPlan).sort((a, b) => b.businessDate.value.localeCompare(a.businessDate.value)).slice(0, 8000),
  };
  const selected: DiscoverySample[] = [];
  const selectedIds = new Set<string>();
  const shortfalls: Record<string, number> = {};
  for (const [sampleClass, quota] of Object.entries(quotas)) {
    const picked = pools[sampleClass]
      .sort((left, right) => stableHash(`${sampleClass}:${left.documentId}`).localeCompare(stableHash(`${sampleClass}:${right.documentId}`)))
      .slice(0, quota);
    for (const row of picked) {
      selected.push({ ...row, sampleClass });
      selectedIds.add(String(row.documentId));
    }
    if (picked.length < quota) shortfalls[sampleClass] = quota - picked.length;
  }
  const deficit = 400 - selected.length;
  const fallback = rows.filter((row) => !selectedIds.has(String(row.documentId)))
    .sort((left, right) => Number(left.hasPlan) - Number(right.hasPlan) || right.businessDate.value.localeCompare(left.businessDate.value) || stableHash(`fallback:${left.documentId}`).localeCompare(stableHash(`fallback:${right.documentId}`)));
  selected.push(...fallback.slice(0, deficit).map((row) => ({ ...row, sampleClass: row.hasPlan ? "fallback_has_plan_for_shortfall" : "fallback_no_plan_for_shortfall" })));
  return { samples: selected.sort((left, right) => Number(left.documentId - right.documentId)), shortfalls };
}

function llmText(blocksJson: unknown): string {
  const root = object(blocksJson);
  return String(root.llm_text ?? root.llmText ?? "");
}

function itemNames(value: unknown): string[] {
  const root = object(value);
  const extraction = object(root.extraction);
  const items = array(extraction.items).length ? array(extraction.items) : array(root.items);
  return items.map((item) => safeProductText(object(item).item_name ?? object(item).itemName ?? object(item).product_name)).filter(Boolean);
}

function planNames(value: unknown): string[] {
  return array(object(value).items).map((item) => safeProductText(object(item).item_name ?? object(item).itemName ?? object(item).product_type_raw)).filter(Boolean);
}

function splitProductPhrases(value: string): string[] {
  return value.split(/[及和与、+＋;；]/u).map((item) => item.trim()).filter(Boolean);
}

export function extractOpenTitleNames(fileName: string | null): string[] {
  let title = path.basename(String(fileName ?? ""), path.extname(String(fileName ?? ""))).normalize("NFKC");
  title = title.replace(/^(?:模头|配件)?生产明细表\s*[:：-]?/u, "")
    .replace(/[（(]?\d{6}(?:[、,，]\d{6})*[）)]?/g, " ")
    .replace(/(?:19|20)\d{2}[-_.年]\d{1,2}[-_.月]\d{1,2}日?/g, " ")
    .replace(/(?:φ|Φ|ø)?\d+(?:\.\d+)?\s*mm/gi, " ");
  const safeSegments = title.split(/[-－—]/u).filter((segment) => !SENSITIVE.test(segment));
  const productTitle = safeSegments.join(" ").replace(/[（(]?\d{4}\s+\d{3,}(?:\s+\d+)?[）)]?/g, " ");
  const found = new Set<string>();
  for (const phrase of splitProductPhrases(productTitle)) {
    const matches = phrase.match(new RegExp(`[\\p{Script=Han}A-Za-z0-9_./（）()\u03a6\u03c6\\s-]{1,60}?(?:模头|模具|管道|小车|装置|系统|支架|适配器|水套|法兰|模唇|垫片|机|器|仪|泵|阀|箱|板|罩)(?=$|[（）()\\s])`, "gu")) ?? [];
    for (const match of matches) {
      const cleaned = safeProductText(match.replace(/^\s*(?:一|二|三|四|五|六|七|八|九|十|\d+)[、.．)）]\s*/u, ""));
      if (cleaned && !/^[（(]?含/u.test(cleaned)) found.add(cleaned);
    }
  }
  return [...found];
}

export function collectProductEvidence(detail: DiscoveryDetail): ProductEvidence[] {
  const evidence: ProductEvidence[] = [];
  const add = (source: ProductEvidence["source"], values: string[]) => {
    for (const value of values.flatMap(splitProductPhrases)) {
      const raw = safeProductText(value);
      if (raw) evidence.push({ raw, source });
    }
  };
  const text = llmText(detail.blocksJson);
  const labeled = [...text.matchAll(/(?:产品中文名称|产品名称|设备名称|品名|项目名称)\s*[:：]\s*([^\t|；;\n]{2,80})/giu)].map((match) => match[1]);
  const headings = text.split(/\r?\n/).slice(0, 260).flatMap((line) => {
    const match = line.match(/^\s*(?:Row\s+\d+\s*[:：]\s*)?(?:\[[A-Z]+\d*\]\s*)?(?:[一二三四五六七八九十]+|\d+)\s*[、.．)）]\s*([^\t|：:]{2,60})\s*$/iu);
    return match ? [match[1]] : [];
  });
  add("labeled_block", labeled);
  add("title_internal", extractOpenTitleNames(detail.fileName));
  add("section_heading", headings);
  add("normalized_item", itemNames(detail.normalizedExtractionJson));
  add("plan_item", planNames(detail.planJson));
  add("extraction_item", itemNames(detail.extractionJson));
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.raw.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateKey(raw: string): string {
  return raw.toLowerCase()
    .replace(/(?:φ|Φ|ø)?\d+(?:\.\d+)?\s*(?:mm|毫米)?/gi, "")
    .replace(/\d+\s*(?:套|台|件|支|根|个|组)/g, "")
    .replace(/[\s\p{P}\p{S}_]+/gu, "")
    .slice(0, 80);
}

export function decideDocumentPrimaryProduct(detail: DiscoveryDetail, definitions: ProductTypeDefinition[]): DocumentProductDecision {
  const observations = collectProductEvidence(detail).map((evidence): ProductObservation => {
    const resolution = resolveProductType(evidence.raw, definitions);
    return { ...evidence, resolution, role: classifyProductItemRole(evidence.raw, resolution), candidateKey: candidateKey(evidence.raw) };
  });
  const rejected = observations.filter((item) => !["main_product", "system"].includes(item.role));
  const eligible = observations.filter((item) => ["main_product", "system"].includes(item.role));
  const groups = new Map<string, ProductObservation[]>();
  for (const item of eligible) {
    const key = item.resolution?.canonicalValue ?? `new:${item.candidateKey}`;
    if (!item.resolution && (!PRODUCT_SHAPE.test(item.raw) || item.candidateKey.length < 2)) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rankedAll = [...groups.entries()].map(([key, items]) => {
    const sources = new Set(items.map((item) => item.source));
    const exactBonus = items.some((item) => item.resolution?.method === "exact") ? 12 : 0;
    const score = Math.max(...items.map((item) => SOURCE_WEIGHT[item.source])) + (sources.size - 1) * 8 + exactBonus;
    const representative = [...items].sort((left, right) => SOURCE_WEIGHT[right.source] - SOURCE_WEIGHT[left.source] || left.raw.length - right.raw.length)[0];
    const firstIndex = Math.min(...items.map((item) => observations.indexOf(item)));
    return { key, items, sources, score, representative, firstIndex };
  }).sort((left, right) => right.score - left.score || left.firstIndex - right.firstIndex || left.key.localeCompare(right.key));
  const ranked = rankedAll.filter((group) => !group.key.startsWith("new:") || !rankedAll.some((other) =>
    other !== group && other.key.startsWith("new:") && other.representative.candidateKey.length > group.representative.candidateKey.length && other.representative.candidateKey.includes(group.representative.candidateKey),
  ));
  const primary = ranked[0];
  const conflict = ranked[1] && ranked[1].score >= primary.score - 10 ? `${primary.key}:${primary.score}|${ranked[1].key}:${ranked[1].score}` : "";
  const packageItems: DocumentProductPackageItem[] = ranked.map((group) => {
    const representative = group.representative;
    const family = representative.resolution?.canonicalValue ?? "";
    return {
      ...classifyDieConfiguration(detail.blocksJson, representative.raw, family),
      productName: representative.raw,
      productFamily: family,
      productDisplayName: representative.resolution?.displayName ?? representative.raw,
      itemRole: representative.role as "main_product" | "system",
      resolutionMethod: representative.resolution?.method ?? "open_title_candidate",
      evidenceSources: [...group.sources].sort().join("|"),
      ruleConfidence: Number(Math.min(0.99, group.score / 130).toFixed(2)),
      candidateKey: representative.candidateKey,
      newProductTypeCandidate: !representative.resolution,
    };
  });
  if (!primary) {
    return {
      ...classifyDieConfiguration(detail.blocksJson, ""),
      documentId: detail.documentId,
      primaryName: "",
      productFamily: "",
      itemRole: "unresolved",
      resolutionMethod: "",
      evidenceSources: "",
      secondaryProducts: "",
      rejectedComponents: [...new Set(rejected.map((item) => item.raw))].slice(0, 12).join(" | "),
      ruleConfidence: 0,
      conflictEvidence: "",
      newProductTypeCandidate: false,
      unresolvedReason: rejected.length ? "component_or_accessory_only" : "no_reliable_product_evidence",
      packageItems: [],
      observations,
    };
  }
  const item = primary.representative;
  return {
    ...classifyDieConfiguration(detail.blocksJson, item.raw, item.resolution?.canonicalValue),
    documentId: detail.documentId,
    primaryName: item.raw,
    productFamily: item.resolution?.canonicalValue ?? "",
    itemRole: item.role as "main_product" | "system",
    resolutionMethod: item.resolution?.method ?? "open_title_candidate",
    evidenceSources: [...primary.sources].sort().join("|"),
    secondaryProducts: ranked.slice(1).map((group) => group.representative.resolution?.displayName ?? group.representative.raw).slice(0, 8).join(" | "),
    rejectedComponents: [...new Set(rejected.map((observation) => observation.raw))].slice(0, 12).join(" | "),
    ruleConfidence: Number(Math.min(0.99, primary.score / 130).toFixed(2)),
    conflictEvidence: conflict,
    newProductTypeCandidate: !item.resolution,
    unresolvedReason: "",
    packageItems,
    observations,
  };
}

export function selectTechnicalQuestionSamples<T extends DocumentProductDecision & { hasPlan: boolean }>(decisions: T[], count = 100): T[] {
  const priority = (item: T) => item.unresolvedReason || item.packageItems.some((product) => product.configurationConflict || product.newProductTypeCandidate)
    ? 0
    : item.packageItems.length > 1 || item.packageItems.some((product) => product.resolutionMethod === "generic_fallback") ? 1 : 2;
  const pick = (hasPlan: boolean, quota: number) => decisions.filter((item) => item.hasPlan === hasPlan)
    .sort((left, right) => priority(left) - priority(right) || stableHash(`golden:${left.documentId}`).localeCompare(stableHash(`golden:${right.documentId}`)))
    .slice(0, quota);
  return [...pick(false, Math.min(70, count)), ...pick(true, count - Math.min(70, count))]
    .sort((left, right) => Number(left.documentId - right.documentId));
}

export const selectGoldenReview = selectTechnicalQuestionSamples;
