import fs from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient({ log: ["error", "warn"] });
const MIN_ID = 100;
const MAX_ID = 200;
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);
const text = (value) => String(value ?? "").trim();

try {
  const documents = await prisma.$queryRaw`
    select
      d.id,
      d.file_name as "fileName",
      er.id as "extractionResultId",
      er.normalized_extraction_json as "normalized"
    from production_config_agent.documents d
    left join lateral (
      select *
      from production_config_agent.extraction_results er
      where er.document_id = d.id
      order by er.created_at desc, er.id desc
      limit 1
    ) er on true
    where d.id between ${MIN_ID} and ${MAX_ID}
    order by d.id asc
  `;

  const usage = collectUsage(documents);
  const termTypes = [...usage.termTypes.keys()].sort();
  const termKeys = [...usage.terms.keys()].sort();
  const termTypeRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select id, term_type, display_name, quote_display_name, description, category, value_kind, scope, concept_role,
               risk_level, baseline_trust_tier, baseline_risk_labels, applicable_product_types, metadata, is_active
        from production_config_agent.dictionary_term_types
        where term_type = any($1::text[])
        order by term_type asc
      `,
        termTypes,
      )
    : [];
  const termRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select id, term_type, canonical_value, display_name, description, scope, concept_role, risk_level,
               baseline_trust_tier, baseline_risk_labels, is_active
        from production_config_agent.dictionary_terms
        where term_type = any($1::text[])
        order by term_type asc, canonical_value asc
      `,
        termTypes,
      )
    : [];
  const aliasRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select id, term_id, term_type, alias_value, normalized_alias, source, confidence, is_active
        from production_config_agent.dictionary_aliases
        where term_type = any($1::text[])
        order by term_type asc, normalized_alias asc
      `,
        termTypes,
      )
    : [];
  const termTypeAliasRows = termTypes.length
    ? await prisma.$queryRawUnsafe(
        `
        select id, term_type, alias_name, normalized_alias_name, description, source, is_active
        from production_config_agent.dictionary_term_type_aliases
        where term_type = any($1::text[])
        order by term_type asc, normalized_alias_name asc
      `,
        termTypes,
      )
    : [];
  const candidateRows = await prisma.$queryRaw`
    select id, document_id as "documentId", term_type as "termType", raw_value as "rawValue", status, evidence
    from production_config_agent.dictionary_candidates
    where document_id between ${MIN_ID} and ${MAX_ID}
    order by document_id asc, id asc
  `;

  const audit = buildAudit({
    documents,
    usage,
    termTypeRows,
    termRows,
    aliasRows,
    termTypeAliasRows,
    candidateRows,
  });
  fs.writeFileSync("tmp/codex-doc100-200-term-audit.json", json(audit));
  fs.writeFileSync("tmp/codex-doc100-200-term-audit.md", renderMarkdown(audit));
  console.log(json(audit.summary));
} finally {
  await prisma.$disconnect();
}

function collectUsage(documents) {
  const termTypes = new Map();
  const terms = new Map();
  const unknownFields = [];
  for (const doc of documents) {
    const normalized = doc.normalized && typeof doc.normalized === "object" ? doc.normalized : {};
    const docId = Number(doc.id);
    for (const [key, value] of Object.entries(normalized.document_info ?? {})) {
      noteTermType(termTypes, key, docId, "document_info");
      noteValueTerms(terms, key, value, docId, "document_info");
    }
    const items = Array.isArray(normalized.items) ? normalized.items : [];
    for (const item of items) {
      for (const field of normalizeFields(item?.fields)) {
        noteTermType(termTypes, field.termType, docId, `item_${item?.item_index ?? "?"}`);
        noteValueTerms(terms, field.termType, field.value, docId, `item_${item?.item_index ?? "?"}`);
      }
      for (const raw of Array.isArray(item?.raw_fields) ? item.raw_fields : []) {
        const field = text(raw?.field_name ?? raw?.termType ?? raw?.term_type);
        if (field && /unknown/i.test(field)) unknownFields.push({ documentId: docId, field, rawValue: raw?.raw_value ?? raw?.value ?? null });
      }
    }
  }
  return { termTypes, terms, unknownFields };
}

function normalizeFields(fields) {
  if (Array.isArray(fields)) {
    return fields
      .map((field) => {
        if (!field || typeof field !== "object") return null;
        const dictionary = field.dictionary && typeof field.dictionary === "object" ? field.dictionary : {};
        const termType = text(dictionary.term_type ?? dictionary.termType ?? field.termType ?? field.term_type ?? field.field_name);
        return termType ? { termType, value: field } : null;
      })
      .filter(Boolean);
  }
  if (fields && typeof fields === "object") {
    return Object.entries(fields).map(([termType, value]) => ({ termType, value }));
  }
  return [];
}

function noteTermType(map, termType, documentId, path) {
  const key = text(termType);
  if (!key) return;
  const entry = map.get(key) ?? { termType: key, count: 0, documents: new Set(), samples: [] };
  entry.count += 1;
  entry.documents.add(documentId);
  if (entry.samples.length < 5) entry.samples.push({ documentId, path });
  map.set(key, entry);
}

function noteValueTerms(map, termType, value, documentId, path) {
  for (const raw of flattenValues(value)) {
    const canonical = extractCanonicalValue(raw);
    if (!canonical) continue;
    const key = `${termType}\u0000${canonical}`;
    const entry = map.get(key) ?? { termType, canonicalValue: canonical, count: 0, documents: new Set(), samples: [] };
    entry.count += 1;
    entry.documents.add(documentId);
    if (entry.samples.length < 5) entry.samples.push({ documentId, path });
    map.set(key, entry);
  }
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value && typeof value === "object" && Array.isArray(value.values)) return value.values.flatMap(flattenValues);
  return [value];
}

function extractCanonicalValue(value) {
  if (value == null) return "";
  if (typeof value !== "object") return text(value);
  const dictionary = value.dictionary && typeof value.dictionary === "object" ? value.dictionary : {};
  const candidate = dictionary.canonical_value ?? dictionary.canonicalValue ?? dictionary.value ?? value.canonical_value ?? value.canonicalValue ?? value.value ?? value.raw_value ?? value.rawValue;
  if (candidate && typeof candidate === "object") return "";
  return text(candidate);
}

function normalizeRowMap(rows, key) {
  return new Map(rows.map((row) => [String(row[key]), row]));
}

function buildAudit({ documents, usage, termTypeRows, termRows, aliasRows, termTypeAliasRows, candidateRows }) {
  const termTypeByName = normalizeRowMap(termTypeRows, "term_type");
  const termByKey = new Map(termRows.map((row) => [`${row.term_type}\u0000${row.canonical_value}`, row]));
  const termTypeIssues = [];
  const termIssues = [];
  const aliasIssues = [];
  const openValuesWithoutTerms = [];

  for (const entry of usage.termTypes.values()) {
    const row = termTypeByName.get(entry.termType);
    const base = { termType: entry.termType, usageCount: entry.count, documentCount: entry.documents.size, sampleDocuments: [...entry.documents].slice(0, 8) };
    if (!row) {
      termTypeIssues.push({ severity: "error", type: "missing_term_type", ...base, reason: "normalized result uses termType not present in dictionary_term_types" });
      continue;
    }
    if (!row.is_active) termTypeIssues.push({ severity: "error", type: "inactive_term_type_used", ...base });
    if (!text(row.display_name) || row.display_name === row.term_type) termTypeIssues.push({ severity: "warning", type: "weak_display_name", ...base, displayName: row.display_name });
    if (!text(row.description)) termTypeIssues.push({ severity: "warning", type: "missing_term_type_description", ...base });
    if (!text(row.category)) termTypeIssues.push({ severity: "info", type: "missing_category", ...base });
    if (row.value_kind === "enum" && !termRows.some((term) => term.term_type === row.term_type && term.is_active)) {
      termTypeIssues.push({ severity: "warning", type: "enum_without_active_terms", ...base });
    }
  }

  for (const entry of usage.terms.values()) {
    const row = termByKey.get(`${entry.termType}\u0000${entry.canonicalValue}`);
    const termTypeRow = termTypeByName.get(entry.termType);
    const valueKind = String(termTypeRow?.value_kind ?? "text");
    const base = { termType: entry.termType, canonicalValue: entry.canonicalValue, usageCount: entry.count, documentCount: entry.documents.size, sampleDocuments: [...entry.documents].slice(0, 8) };
    if (!row) {
      if (valueKind === "enum" || valueKind === "enums") {
        termIssues.push({ severity: "error", type: "missing_enum_term", ...base, valueKind, reason: "enum/enums normalized value has no matching dictionary_terms row" });
      } else {
        openValuesWithoutTerms.push({ ...base, valueKind });
      }
      continue;
    }
    if (!row.is_active && (valueKind === "enum" || valueKind === "enums")) {
      termIssues.push({ severity: "error", type: "inactive_term_used", ...base });
    }
    if (!text(row.display_name)) termIssues.push({ severity: "warning", type: "missing_term_display_name", ...base });
    if (!text(row.description)) termIssues.push({ severity: "info", type: "missing_term_description", ...base });
  }

  const aliasConflicts = new Map();
  for (const row of aliasRows.filter((item) => item.is_active)) {
    const key = `${row.term_type}\u0000${row.normalized_alias}`;
    const list = aliasConflicts.get(key) ?? [];
    list.push(row);
    aliasConflicts.set(key, list);
  }
  for (const [key, rows] of aliasConflicts) {
    if (new Set(rows.map((row) => String(row.term_id))).size > 1) {
      const [termType, normalizedAlias] = key.split("\u0000");
      aliasIssues.push({ severity: "error", type: "alias_points_to_multiple_terms", termType, normalizedAlias, termIds: rows.map((row) => row.term_id) });
    }
  }
  for (const row of aliasRows) {
    if (!termByKey.has(`${row.term_type}\u0000${termRows.find((term) => String(term.id) === String(row.term_id))?.canonical_value ?? ""}`) && !termRows.some((term) => String(term.id) === String(row.term_id))) {
      aliasIssues.push({ severity: "error", type: "alias_orphan_term_id", termType: row.term_type, aliasValue: row.alias_value, termId: row.term_id });
    }
  }

  const pendingCandidates = candidateRows.filter((row) => row.status === "pending");
  const usedTermTypes = [...usage.termTypes.values()].map((entry) => ({ ...entry, documents: [...entry.documents] })).sort((a, b) => b.count - a.count || a.termType.localeCompare(b.termType));
  const usedTerms = [...usage.terms.values()].map((entry) => ({ ...entry, documents: [...entry.documents] })).sort((a, b) => b.count - a.count || a.termType.localeCompare(b.termType));
  return {
    generatedAt: new Date().toISOString(),
    range: { min: MIN_ID, max: MAX_ID },
    summary: {
      documentCount: documents.length,
      usedTermTypeCount: usedTermTypes.length,
      usedTermCount: usedTerms.length,
      termTypeIssueCount: termTypeIssues.length,
      termIssueCount: termIssues.length,
      aliasIssueCount: aliasIssues.length,
      openValueWithoutTermCount: openValuesWithoutTerms.length,
      pendingCandidateCount: pendingCandidates.length,
      unknownRawFieldCount: usage.unknownFields.length,
      businessLlmTokens: 0,
    },
    usedTermTypes,
    usedTerms,
    termTypeDefinitions: termTypeRows,
    termDefinitions: termRows,
    termTypeAliases: termTypeAliasRows,
    aliases: aliasRows,
    issues: { termTypes: termTypeIssues, terms: termIssues, aliases: aliasIssues, pendingCandidates, unknownFields: usage.unknownFields },
    openValuesWithoutTerms,
  };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push("# Document 100-200 Term/TermType Audit", "");
  lines.push(`Generated: ${audit.generatedAt}`);
  lines.push("Scope: read-only production DB; no business LLM; business LLM tokens = 0.", "");
  lines.push("## Summary", "");
  for (const [key, value] of Object.entries(audit.summary)) lines.push(`- ${key}: ${value}`);
  lines.push("", "## Issues", "");
  renderIssueTable(lines, "TermType", audit.issues.termTypes);
  renderIssueTable(lines, "Term", audit.issues.terms);
  renderIssueTable(lines, "Alias", audit.issues.aliases);
  renderIssueTable(lines, "Pending Candidate", audit.issues.pendingCandidates.map((item) => ({
    severity: "warning",
    type: "pending_candidate",
    documentId: item.documentId,
    termType: item.termType,
    rawValue: item.rawValue,
    status: item.status,
  })));
  lines.push("", "## Used TermTypes", "", "| termType | usage | docs | definition | valueKind | scope | category |", "| --- | ---: | ---: | --- | --- | --- | --- |");
  const definitions = new Map(audit.termTypeDefinitions.map((row) => [row.term_type, row]));
  for (const item of audit.usedTermTypes) {
    const row = definitions.get(item.termType) ?? {};
    lines.push(`| ${item.termType} | ${item.count} | ${item.documents.length} | ${text(row.display_name)} | ${text(row.value_kind)} | ${text(row.scope)} | ${text(row.category)} |`);
  }
  lines.push("", "## Used Terms Top 200", "", "| termType | canonicalValue | usage | docs | displayName |", "| --- | --- | ---: | ---: | --- |");
  const termRows = new Map(audit.termDefinitions.map((row) => [`${row.term_type}\u0000${row.canonical_value}`, row]));
  for (const item of audit.usedTerms.slice(0, 200)) {
    const row = termRows.get(`${item.termType}\u0000${item.canonicalValue}`) ?? {};
    lines.push(`| ${item.termType} | ${String(item.canonicalValue).replace(/\|/g, "\\|")} | ${item.count} | ${item.documents.length} | ${text(row.display_name)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderIssueTable(lines, title, issues) {
  lines.push(`### ${title}`, "");
  if (!issues.length) {
    lines.push("No issues.", "");
    return;
  }
  lines.push("| severity | type | termType | value/raw | docs | reason |", "| --- | --- | --- | --- | --- | --- |");
  for (const issue of issues.slice(0, 120)) {
    lines.push(`| ${issue.severity ?? ""} | ${issue.type ?? ""} | ${issue.termType ?? ""} | ${String(issue.canonicalValue ?? issue.rawValue ?? issue.normalizedAlias ?? "").replace(/\|/g, "\\|")} | ${(issue.sampleDocuments ?? [issue.documentId]).filter(Boolean).join(",")} | ${String(issue.reason ?? "").replace(/\|/g, "\\|")} |`);
  }
  if (issues.length > 120) lines.push(`| info | truncated | | | | ${issues.length - 120} more in JSON |`);
  lines.push("");
}
