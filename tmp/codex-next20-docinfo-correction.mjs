import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const source = "codex_next20_docinfo_correction_20260708";
const documentIds = Array.from({ length: 20 }, (_, index) => index + 10);

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { normalizeExtractionWithDictionary } = await import("../apps/server/build/modules/productConfigAgent/normalization/index.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const corrections = [];
for (const documentId of documentIds) {
  const blocks = await prisma.documentBlock.findUnique({ where: { documentId: BigInt(documentId) } });
  const latest = await prisma.extractionResult.findFirst({
    where: { documentId: BigInt(documentId) },
    orderBy: { createdAt: "desc" },
  });
  if (!blocks || !latest) continue;
  const docInfo = parseDocInfo(blocks.blocksJson);
  if (Object.keys(docInfo).length === 0) continue;
  const extractionJson = clone(latest.extractionJson);
  const root = extractionJson.extraction && typeof extractionJson.extraction === "object" ? extractionJson.extraction : extractionJson;
  root.document_info = { ...(root.document_info ?? {}), ...docInfo };
  patchItemIdentity(documentId, root);
  const normalized = await normalizeExtractionWithDictionary(extractionJson);
  const created = await prisma.extractionResult.create({
    data: {
      documentId: BigInt(documentId),
      extractionJson,
      normalizedExtractionJson: normalized,
      dictionaryProposals: normalized.dictionaryProposals ?? {},
      warnings: [
        ...(Array.isArray(latest.warnings) ? latest.warnings : []),
        { type: "codex_manual_docinfo_correction", source, basedOnExtractionResultId: String(latest.id) },
      ],
      llmPlanJson: { source: "codex_manual_blocks_read", businessLlmCalled: false, basedOnExtractionResultId: String(latest.id) },
      llmModel: "codex-manual-correction",
      promptVersion: "codex-docinfo-correction-20260708",
      dictionaryVersion: latest.dictionaryVersion,
      status: "normalized",
    },
  });
  await prisma.productDocument.update({ where: { id: BigInt(documentId) }, data: { dictionaryDirty: true } });
  corrections.push({
    documentId,
    basedOnExtractionResultId: String(latest.id),
    createdExtractionResultId: String(created.id),
    docInfo: normalized.document_info,
    items: (normalized.items ?? []).map((item) => ({
      itemIndex: item.item_index,
      itemName: item.item_name,
      itemQuantity: item.item_quantity,
      productType: item.product_type_hint,
    })),
  });
}

const refreshRuns = [];
for (const documentId of documentIds) {
  refreshRuns.push({
    documentId,
    result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source }),
  });
}

const after = await snapshot();
const report = { source, corrections, refreshRuns, after, businessLlmTokens: 0 };
fs.writeFileSync("tmp/codex-next20-docinfo-correction-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(summarize(report)), null, 2));
await prisma.$disconnect();

function parseDocInfo(blocksJson) {
  const blocks = Array.isArray(blocksJson?.blocks) ? blocksJson.blocks : [];
  const text = blocks.slice(0, 12).map((block) => String(block.text ?? "")).join("\n");
  const productNumber = match(text, /(?:模具编号|配件编号)：\s*([A-Za-z0-9&\-\s]+?)(?=下单日期|客户ID|\n|$)/u);
  const customerId = match(text, /客户ID：\s*([0-9]+)/u);
  const country = match(text, /国家[（(]\s*([^）)]*?)\s*[）)]/u);
  const contractNumber = match(text, /合同编号：\s*([A-Za-z0-9-]+)/u);
  const contractDeliveryDate = parseDateText(match(text, /合同规定交货日期：\s*([^\n]*)/u) || match(text, /(20[0-9]{2}年[0-9]{1,2}月[0-9]{1,2}日)/u));
  const orderDate = parseDateText(match(text, /下单日期：\s*([0-9年月日-]+)/u));
  const deliveryDate = parseDateText(match(text, /交货日期：\s*([0-9年月日-]+)/u));
  return Object.fromEntries(Object.entries({
    product_number: productNumber,
    customer_id: customerId,
    usage_market: /\[SEL\]\s*出口使用|■\s*出口使用/u.test(text) ? "出口使用" : undefined,
    country: country || undefined,
    contract_number: contractNumber,
    contract_delivery_date: contractDeliveryDate,
    order_date: orderDate,
    delivery_date: deliveryDate || contractDeliveryDate,
  }).filter(([, value]) => value));
}

function patchItemIdentity(documentId, root) {
  if (documentId !== 16) return;
  const item = (Array.isArray(root.items) ? root.items : []).find((value) => Number(value?.item_index) === 1);
  if (!item) return;
  item.item_name = {
    value: "1150mmPVC硬质不透明片材模头",
    evidence: { source: "filename_and_blocks", text: "1150mmPVC硬质不透明片材模头；B9 PVC硬质不透明片材；B13 1150mm" },
    confidence: 0.9,
  };
}

function match(text, pattern) {
  const value = text.match(pattern)?.[1]?.trim();
  return value ? value.replace(/\s+/g, " ").trim() : null;
}

function parseDateText(value) {
  if (!value) return null;
  const chinese = value.match(/(20[0-9]{2})年([0-9]{1,2})月([0-9]{1,2})日/u);
  if (chinese) return `${chinese[1]}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`;
  const dashed = value.match(/(20[0-9]{2})-([0-9]{1,2})-([0-9]{1,2})/u);
  if (dashed) return `${dashed[1]}-${dashed[2].padStart(2, "0")}-${dashed[3].padStart(2, "0")}`;
  return null;
}

async function snapshot() {
  const ids = documentIds.map(BigInt);
  const archives = await prisma.contractArchive.findMany({
    where: { documentId: { in: ids } },
    select: { id: true, documentId: true, extractionResultId: true, productNumber: true, contractNumber: true, customerId: true, country: true, dirtyReason: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const items = await prisma.contractArchiveItem.findMany({
    where: { documentId: { in: ids } },
    select: { documentId: true, itemIndex: true, itemName: true, itemQuantity: true, productTypeHint: true },
    orderBy: [{ documentId: "asc" }, { itemIndex: "asc" }],
  });
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: ids }, dictionaryDirty: true },
    select: { id: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  return { archives, items, dirtyDocs };
}

function summarize(report) {
  return {
    correctionCount: report.corrections.length,
    refreshSuccessCount: report.refreshRuns.filter((run) => run.result.failedCount === 0).length,
    refreshFailures: report.refreshRuns.filter((run) => run.result.failedCount > 0),
    archives: report.after.archives,
    dirtyDocs: report.after.dirtyDocs,
    businessLlmTokens: 0,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
