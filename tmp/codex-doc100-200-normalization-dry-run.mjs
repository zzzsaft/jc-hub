import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient({ log: ["error", "warn"] });
const MIN_ID = 100;
const MAX_ID = 200;

const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

try {
  const rows = await prisma.$queryRaw`
    select d.id, er.id as "extractionResultId", er.extraction_json as "extractionJson"
    from production_config_agent.documents d
    join lateral (
      select *
      from production_config_agent.extraction_results er
      where er.document_id = d.id
      order by er.created_at desc, er.id desc
      limit 1
    ) er on true
    where d.id between ${MIN_ID} and ${MAX_ID}
    order by d.id asc
  `;

  const normalizedRows = [];
  for (const row of rows) {
    const normalized = await normalizeExtractionWithDictionary(row.extractionJson);
    normalizedRows.push({ documentId: Number(row.id), extractionResultId: Number(row.extractionResultId), normalized });
  }

  const termTypes = [...collectTermTypes(normalizedRows)];
  const termTypeRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select term_type, value_kind, is_active
        from production_config_agent.dictionary_term_types
        where term_type = any($1::text[])
      `,
        termTypes,
      )
    : [];
  const termRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select term_type, canonical_value, is_active, description
        from production_config_agent.dictionary_terms
        where term_type = any($1::text[])
      `,
        termTypes,
      )
    : [];
  const termTypeByName = new Map(termTypeRows.map((row) => [row.term_type, row]));
  const termByKey = new Map(termRows.map((row) => [`${row.term_type}\u0000${row.canonical_value}`, row]));
  const missingEnumTerms = new Map();
  const openValues = new Map();

  for (const row of normalizedRows) {
    for (const { termType, value } of iterFields(row.normalized)) {
      for (const canonicalValue of flattenValues(value).map(extractCanonicalValue).filter(Boolean)) {
        const termTypeRow = termTypeByName.get(termType);
        const valueKind = String(termTypeRow?.value_kind ?? "text");
        const key = `${termType}\u0000${canonicalValue}`;
        if (!termByKey.has(key)) {
          const target = valueKind === "enum" || valueKind === "enums" ? missingEnumTerms : openValues;
          const entry = target.get(key) ?? { termType, canonicalValue, documents: new Set(), count: 0 };
          entry.documents.add(row.documentId);
          entry.count += 1;
          target.set(key, entry);
        }
      }
    }
  }

  const missing = [...missingEnumTerms.values()]
    .map((item) => ({ ...item, documents: [...item.documents].sort((a, b) => a - b) }))
    .sort((a, b) => b.count - a.count || a.termType.localeCompare(b.termType) || a.canonicalValue.localeCompare(b.canonicalValue));

  console.log(JSON.stringify({
    documentCount: rows.length,
    missingEnumTermCount: missing.length,
    openValueWithoutTermCount: openValues.size,
    missingEnumTerms: missing,
    businessLlmTokens: 0,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}

function collectTermTypes(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const { termType } of iterFields(row.normalized)) set.add(termType);
  }
  return set;
}

function iterFields(normalized) {
  const result = [];
  for (const [termType, value] of Object.entries(normalized?.document_info ?? {})) result.push({ termType, value });
  for (const item of Array.isArray(normalized?.items) ? normalized.items : []) {
    for (const [termType, value] of Object.entries(item?.fields ?? {})) result.push({ termType, value });
  }
  return result;
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value && typeof value === "object" && Array.isArray(value.values)) return value.values.flatMap(flattenValues);
  return [value];
}

function extractCanonicalValue(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value).trim();
  const dictionary = value.dictionary && typeof value.dictionary === "object" ? value.dictionary : {};
  const candidate = dictionary.canonical_value ?? dictionary.canonicalValue ?? dictionary.value ?? value.canonical_value ?? value.canonicalValue ?? value.value ?? value.raw_value ?? value.rawValue;
  if (candidate && typeof candidate === "object") return "";
  return String(candidate ?? "").trim();
}
