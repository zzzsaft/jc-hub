import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";

const envPath = process.argv[2] || "/Users/zzzsaft/Documents/jc-hub/.env";
dotenv.config({ path: envPath });

const prisma = new PrismaClient({ log: ["error", "warn"] });

const json = (value) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);
const normalizeText = (value) => String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
const stableStringify = (value) => {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};
const blockText = (block) => {
  const source = block?.source && typeof block.source === "object" ? block.source : {};
  return [source.sheet_name ?? source.sheetName ?? "", source.row ?? "", block?.text ?? block?.raw_text ?? ""]
    .map((item) => String(item ?? ""))
    .join("\t");
};
const contentText = (blocksJson) => {
  if (!blocksJson || typeof blocksJson !== "object") return "";
  if (typeof blocksJson.llm_text === "string" && blocksJson.llm_text.trim()) return normalizeText(blocksJson.llm_text);
  if (Array.isArray(blocksJson.blocks)) return normalizeText(blocksJson.blocks.map(blockText).join("\n"));
  return normalizeText(stableStringify(blocksJson));
};
const contentHash = (blocksJson) => {
  const text = contentText(blocksJson);
  return text ? crypto.createHash("sha256").update(text).digest("hex") : null;
};
const tokenEstimate = (text) => Math.ceil(String(text ?? "").length / 1.8);

try {
  const docs = await prisma.$queryRaw`
    select
      d.id,
      d.file_name as "fileName",
      d.file_path as "filePath",
      d.file_hash as "fileHash",
      d.status,
      d.created_at as "createdAt",
      b.blocks_json as "blocksJson",
      b.parser_version as "parserVersion",
      er.id as "extractionResultId",
      er.extraction_json as "extractionJson",
      er.normalized_extraction_json as "normalizedExtractionJson",
      er.dictionary_proposals as "dictionaryProposals",
      er.warnings
    from production_config_agent.documents d
    join production_config_agent.document_blocks b on b.document_id = d.id
    left join lateral (
      select *
      from production_config_agent.extraction_results er
      where er.document_id = d.id
      order by er.created_at desc, er.id desc
      limit 1
    ) er on true
    order by d.id asc
    limit 200
  `;
  const duplicateRows = await prisma.$queryRaw`
    select document_id as "documentId", duplicate_document_id as "duplicateDocumentId", duplicate_type as "duplicateType", metadata
    from production_config_agent.document_duplicates
  `;

  const seenFileHashes = new Map();
  const seenContentHashes = new Map();
  const selected = [];
  const skipped = [];
  const duplicateTargets = new Map();
  for (const row of duplicateRows) {
    const left = Number(row.documentId);
    const right = Number(row.duplicateDocumentId);
    duplicateTargets.set(left, Math.min(left, right));
  }

  for (const doc of docs) {
    const id = Number(doc.id);
    const canonicalId = duplicateTargets.get(id);
    const hash = contentHash(doc.blocksJson);
    const fileSeen = seenFileHashes.get(doc.fileHash);
    const contentSeen = hash ? seenContentHashes.get(hash) : null;
    if (canonicalId && canonicalId < id) {
      skipped.push({ id, reason: "document_duplicates", canonicalId });
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
    seenFileHashes.set(doc.fileHash, id);
    if (hash) seenContentHashes.set(hash, id);
    selected.push({ ...doc, id, contentHash: hash, approxBlocksTokens: tokenEstimate(contentText(doc.blocksJson)) });
    if (selected.length === 5) break;
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
        where document_id in (${Prisma.join(ids)})
           or candidate_id in (${Prisma.join(candidateIds)})
        order by document_id asc, candidate_id asc, id asc
      `
    : [];
  const termTypes = [...new Set(candidates.map((candidate) => candidate.term_type ?? candidate.termType).filter(Boolean))];
  const dictionary = termTypes.length
    ? {
        termTypes: await prisma.$queryRaw`
          select *
          from production_config_agent.dictionary_term_types
          where term_type in (${Prisma.join(termTypes)})
          order by term_type asc
        `,
        termTypeAliases: await prisma.$queryRaw`
          select *
          from production_config_agent.dictionary_term_type_aliases
          where term_type in (${Prisma.join(termTypes)})
          order by term_type asc, alias_name asc
        `,
        terms: await prisma.$queryRaw`
          select *
          from production_config_agent.dictionary_terms
          where term_type in (${Prisma.join(termTypes)})
          order by term_type asc, canonical_value asc
        `,
        termAliases: await prisma.$queryRaw`
          select *
          from production_config_agent.dictionary_aliases
          where term_type in (${Prisma.join(termTypes)})
          order by term_type asc, alias_value asc
        `,
      }
    : { termTypes: [], termTypeAliases: [], terms: [], termAliases: [] };

  const out = {
    envPath,
    selected: selected.map((doc) => ({
      ...doc,
      duplicateSkippedBeforeSelection: skipped,
      approxJsonTokens: tokenEstimate(json(doc.blocksJson)),
      approxExtractionTokens: tokenEstimate(json(doc.extractionJson) + json(doc.normalizedExtractionJson)),
    })),
    candidates,
    occurrences,
    dictionary,
  };
  const outPath = path.resolve("tmp/codex-readonly-doc-audit-data.json");
  fs.writeFileSync(outPath, json(out));
  console.log(json({
    outPath,
    selected: selected.map(({ id, fileName, status, parserVersion, extractionResultId, approxBlocksTokens }) => ({
      id,
      fileName,
      status,
      parserVersion,
      extractionResultId: extractionResultId?.toString?.() ?? extractionResultId,
      approxBlocksTokens,
    })),
    skippedBeforeSelection: skipped,
    candidateCount: candidates.length,
    occurrenceCount: occurrences.length,
    termTypeCount: dictionary.termTypes.length,
  }));
} finally {
  await prisma.$disconnect();
}
