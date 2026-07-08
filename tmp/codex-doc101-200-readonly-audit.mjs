import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient({ log: ["error", "warn"] });
const MIN_ID = 101;
const MAX_ID = 200;

const json = (value) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);
const text = (value) => String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const tokenEstimate = (value) => Math.ceil(String(value ?? "").length / 1.8);

function blockText(block) {
  const source = block?.source && typeof block.source === "object" ? block.source : {};
  return [source.sheet_name ?? source.sheetName ?? "", source.row ?? "", block?.text ?? block?.raw_text ?? ""]
    .map((item) => String(item ?? ""))
    .join("\t");
}

function contentText(blocksJson, llmText) {
  if (text(llmText)) return text(llmText);
  if (blocksJson && typeof blocksJson === "object" && typeof blocksJson.llm_text === "string" && blocksJson.llm_text.trim()) return text(blocksJson.llm_text);
  if (blocksJson && typeof blocksJson === "object" && Array.isArray(blocksJson.blocks)) return text(blocksJson.blocks.map(blockText).join("\n"));
  return text(json(blocksJson));
}

function pickLines(value) {
  const lines = text(value).split("\n").map((line) => line.trim()).filter(Boolean);
  const keep = [];
  const patterns = /(合同|订单|产品|客户|国家|日期|交货|数量|名称|型号|规格|材料|材质|硬度|层|上模|下模|模唇|侧板|加热|进料|出料|流道|宽度|厚度|温度|压力|电压|功率|接线|安装|传感器|热电偶|备注|编号|使用)/;
  lines.forEach((line, index) => {
    if (index < 18 || patterns.test(line)) keep.push({ line: index + 1, text: line.slice(0, 320) });
  });
  return keep.slice(0, 220);
}

function summarizeNormalized(normalized) {
  const docInfo = normalized?.document_info ?? {};
  const items = Array.isArray(normalized?.items) ? normalized.items : [];
  return {
    documentInfo: docInfo,
    items: items.map((item) => ({
      itemIndex: item.item_index,
      itemName: item.item_name,
      quantity: item.item_quantity,
      productType: item.product_type_hint,
      fields: item.fields ?? {},
      rawFieldCount: Array.isArray(item.raw_fields) ? item.raw_fields.length : 0,
    })),
  };
}

function candidateType(candidate) {
  const evidence = candidate.evidence && typeof candidate.evidence === "object" ? candidate.evidence : {};
  return evidence.candidateType ?? (candidate.term_type === "unknown_field" ? "term_type" : "value");
}

try {
  const rows = await prisma.$queryRaw`
    select
      d.id,
      d.file_name as "fileName",
      d.file_path as "filePath",
      d.file_hash as "fileHash",
      d.status,
      b.blocks_json as "blocksJson",
      b.parser_version as "parserVersion",
      er.id as "extractionResultId",
      er.extraction_json as "extractionJson",
      er.normalized_extraction_json as "normalizedExtractionJson",
      er.dictionary_proposals as "dictionaryProposals",
      er.warnings,
      ca.id as "archiveId",
      ca.extraction_result_id as "archiveExtractionResultId",
      ca.status as "archiveStatus",
      ca.dirty_reason as "archiveDirtyReason",
      ca.contract_number as "archiveContractNumber",
      ca.product_number as "archiveProductNumber",
      ca.customer_id as "archiveCustomerId",
      ca.country as "archiveCountry",
      ca.order_date as "archiveOrderDate",
      ca.delivery_date as "archiveDeliveryDate"
    from production_config_agent.documents d
    join production_config_agent.document_blocks b on b.document_id = d.id
    left join lateral (
      select *
      from production_config_agent.extraction_results er
      where er.document_id = d.id
      order by er.created_at desc, er.id desc
      limit 1
    ) er on true
    left join lateral (
      select *
      from production_config_agent.contract_archives ca
      where ca.document_id = d.id
      order by ca.updated_at desc, ca.id desc
      limit 1
    ) ca on true
    where d.id between ${MIN_ID} and ${MAX_ID}
    order by d.id asc
  `;

  const priorRows = await prisma.$queryRaw`
    select d.id, d.file_hash as "fileHash", b.blocks_json as "blocksJson"
    from production_config_agent.documents d
    join production_config_agent.document_blocks b on b.document_id = d.id
    where d.id < ${MAX_ID}
    order by d.id asc
  `;
  const duplicateRows = await prisma.$queryRaw`
    select document_id as "documentId", duplicate_document_id as "duplicateDocumentId", duplicate_type as "duplicateType", confidence, metadata
    from production_config_agent.document_duplicates
    where document_id between ${MIN_ID} and ${MAX_ID}
       or duplicate_document_id between ${MIN_ID} and ${MAX_ID}
  `;

  const priorFileHashes = new Map();
  const priorContentHashes = new Map();
  for (const row of priorRows) {
    const id = Number(row.id);
    const body = contentText(row.blocksJson, null);
    if (id < MIN_ID && row.fileHash && !priorFileHashes.has(row.fileHash)) priorFileHashes.set(row.fileHash, id);
    if (id < MIN_ID && body) {
      const hash = sha(body);
      if (!priorContentHashes.has(hash)) priorContentHashes.set(hash, id);
    }
  }

  const duplicateCanonical = new Map();
  for (const row of duplicateRows) {
    const a = Number(row.documentId);
    const b = Number(row.duplicateDocumentId);
    duplicateCanonical.set(Math.max(a, b), { canonicalId: Math.min(a, b), row });
  }

  const seenFileHashes = new Map(priorFileHashes);
  const seenContentHashes = new Map(priorContentHashes);
  const selected = [];
  const skipped = [];
  for (const doc of rows) {
    const id = Number(doc.id);
    const body = contentText(doc.blocksJson, null);
    const contentHash = body ? sha(body) : null;
    const canonical = duplicateCanonical.get(id);
    const fileSeen = doc.fileHash ? seenFileHashes.get(doc.fileHash) : null;
    const contentSeen = contentHash ? seenContentHashes.get(contentHash) : null;
    if (canonical && canonical.canonicalId < id) {
      skipped.push({ id, reason: "document_duplicates", canonicalId: canonical.canonicalId, detail: canonical.row });
      continue;
    }
    if (fileSeen) {
      skipped.push({ id, reason: "file_hash", canonicalId: fileSeen });
      continue;
    }
    if (contentSeen) {
      skipped.push({ id, reason: "blocks_content_hash", canonicalId: contentSeen });
      continue;
    }
    if (doc.fileHash) seenFileHashes.set(doc.fileHash, id);
    if (contentHash) seenContentHashes.set(contentHash, id);
    selected.push({ ...doc, id, body, contentHash, approxBlocksTokens: tokenEstimate(body), approxJsonTokens: tokenEstimate(json(doc.blocksJson)) });
  }

  const ids = selected.map((doc) => BigInt(doc.id));
  const extractionIds = selected.map((doc) => doc.extractionResultId).filter(Boolean).map(BigInt);
  const candidates = ids.length
    ? await prisma.$queryRaw`
      select *
      from production_config_agent.dictionary_candidates
      where document_id in (${Prisma.join(ids)})
         or extraction_result_id in (${Prisma.join(extractionIds.length ? extractionIds : [BigInt(-1)])})
      order by document_id asc nulls last, id asc
    `
    : [];
  const candidateIds = candidates.map((candidate) => BigInt(candidate.id));
  const occurrences = candidateIds.length
    ? await prisma.$queryRaw`
      select *
      from production_config_agent.dictionary_candidate_occurrences
      where candidate_id in (${Prisma.join(candidateIds)})
      order by candidate_id asc, document_id asc, id asc
    `
    : [];
  const termTypes = [...new Set(candidates.map((candidate) => candidate.term_type).filter(Boolean))];
  const dictionary = termTypes.length
    ? {
      termTypes: await prisma.$queryRaw`
        select term_type, display_name, value_kind, metadata, is_active
        from production_config_agent.dictionary_term_types
        where term_type in (${Prisma.join(termTypes)})
        order by term_type asc
      `,
      aliases: await prisma.$queryRaw`
        select term_type, alias_value, normalized_alias, term_id, is_active
        from production_config_agent.dictionary_aliases
        where term_type in (${Prisma.join(termTypes)})
        order by term_type asc, alias_value asc
      `,
      terms: await prisma.$queryRaw`
        select id, term_type, canonical_value, display_name, is_active
        from production_config_agent.dictionary_terms
        where term_type in (${Prisma.join(termTypes)})
        order by term_type asc, canonical_value asc
      `,
      termTypeAliases: await prisma.$queryRaw`
        select term_type, alias_name, normalized_alias_name, is_active
        from production_config_agent.dictionary_term_type_aliases
        where term_type in (${Prisma.join(termTypes)})
        order by term_type asc, alias_name asc
      `,
    }
    : { termTypes: [], aliases: [], terms: [], termTypeAliases: [] };
  const unitAliases = await prisma.$queryRaw`
    select canonical_unit, display_unit, alias_value, normalized_alias, is_active
    from production_config_agent.dictionary_unit_aliases
    order by canonical_unit asc, alias_value asc
  `;
  const archiveItemCounts = ids.length
    ? await prisma.$queryRaw`
      select document_id as "documentId", count(*)::int as "itemCount"
      from production_config_agent.contract_archive_items
      where document_id in (${Prisma.join(ids)})
      group by document_id
      order by document_id asc
    `
    : [];

  const byDocCandidates = new Map();
  for (const candidate of candidates) {
    const documentId = Number(candidate.document_id ?? 0);
    if (!byDocCandidates.has(documentId)) byDocCandidates.set(documentId, []);
    byDocCandidates.get(documentId).push({
      id: Number(candidate.id),
      candidateType: candidateType(candidate),
      termType: candidate.term_type,
      rawValue: candidate.raw_value,
      normalizedRawValue: candidate.normalized_raw_value,
      proposedCanonicalValue: candidate.proposed_canonical_value,
      status: candidate.status,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
    });
  }
  const itemCountByDoc = new Map(archiveItemCounts.map((row) => [Number(row.documentId), Number(row.itemCount)]));

  const report = {
    generatedAt: new Date().toISOString(),
    envPath: "/Users/zzzsaft/Documents/jc-hub/.env",
    range: { minId: MIN_ID, maxId: MAX_ID },
    selected: selected.map((doc) => ({
      document: {
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath,
        fileHash: doc.fileHash,
        status: doc.status,
      },
      parserVersion: doc.parserVersion,
      extractionResultId: doc.extractionResultId?.toString?.() ?? doc.extractionResultId,
      archive: {
        id: doc.archiveId?.toString?.() ?? doc.archiveId,
        extractionResultId: doc.archiveExtractionResultId?.toString?.() ?? doc.archiveExtractionResultId,
        status: doc.archiveStatus,
        dirtyReason: doc.archiveDirtyReason,
        contractNumber: doc.archiveContractNumber,
        productNumber: doc.archiveProductNumber,
        customerId: doc.archiveCustomerId,
        country: doc.archiveCountry,
        orderDate: doc.archiveOrderDate,
        deliveryDate: doc.archiveDeliveryDate,
        itemCount: itemCountByDoc.get(doc.id) ?? 0,
      },
      contentHash: doc.contentHash,
      approxBlocksTokens: doc.approxBlocksTokens,
      approxJsonTokens: doc.approxJsonTokens,
      lineSamples: pickLines(doc.body),
      normalizedSummary: summarizeNormalized(doc.normalizedExtractionJson),
      extractionWarnings: doc.warnings,
      dictionaryProposals: doc.dictionaryProposals,
      candidates: byDocCandidates.get(doc.id) ?? [],
    })),
    skipped,
    duplicateRows,
    occurrenceCount: occurrences.length,
    dictionary,
    unitAliases,
    raw: { candidates, occurrences },
  };

  const outJson = path.resolve("tmp/codex-doc101-200-readonly-audit-data.json");
  const outMd = path.resolve("tmp/codex-doc101-200-readonly-audit-report.md");
  fs.writeFileSync(outJson, json(report));
  fs.writeFileSync(outMd, [
    "# Codex Document 101-200 Readonly Audit",
    "",
    "Constraints: readonly production DB; business LLM tokens = 0; no pending_llm_upload job; no worker.",
    "",
    ...report.selected.flatMap((doc) => [
      `## Document ${doc.document.id} ${doc.document.fileName}`,
      "",
      `- extractionResultId: ${doc.extractionResultId}`,
      `- archiveExtractionResultId: ${doc.archive.extractionResultId}`,
      `- archiveDirtyReason: ${doc.archive.dirtyReason}`,
      `- archiveItemCount: ${doc.archive.itemCount}`,
      `- approxBlocksTokens: ${doc.approxBlocksTokens}`,
      `- candidates: ${doc.candidates.length}`,
      "",
      "### Normalized",
      "```json",
      json(doc.normalizedSummary).slice(0, 22000),
      "```",
      "",
      "### Candidate",
      "```json",
      json(doc.candidates).slice(0, 16000),
      "```",
      "",
      "### Lines",
      ...doc.lineSamples.map((line) => `- L${line.line}: ${line.text}`),
      "",
    ]),
    "## Skipped",
    "",
    "```json",
    json(report.skipped),
    "```",
  ].join("\n"));

  console.log(json({
    outJson,
    outMd,
    selectedCount: report.selected.length,
    selected: report.selected.map((doc) => ({
      id: doc.document.id,
      fileName: doc.document.fileName,
      extractionResultId: doc.extractionResultId,
      approxBlocksTokens: doc.approxBlocksTokens,
      candidateCount: doc.candidates.length,
      archiveItemCount: doc.archive.itemCount,
      archiveDirtyReason: doc.archive.dirtyReason,
    })),
    skipped,
    occurrenceCount: occurrences.length,
    termTypeCount: dictionary.termTypes.length,
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}
