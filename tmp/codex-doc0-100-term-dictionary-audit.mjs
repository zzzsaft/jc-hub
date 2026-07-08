import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const MAIN_ENV = "/Users/zzzsaft/Documents/jc-hub/.env";
const OUT_JSON = path.join(ROOT, "tmp/codex-doc0-100-term-dictionary-audit.json");
const OUT_MD = path.join(ROOT, "tmp/codex-doc0-100-term-dictionary-audit.md");
const DOC_MIN = 0;
const DOC_MAX = 100;
const ENUM_KINDS = new Set(["enum", "enums"]);
const NON_VALUE_KINDS = new Set(["text", "number", "number_unit", "boolean", "date"]);
const PLACEHOLDER_RE = /^(unknown|未知|未明确|不明确|无|none|null|n\/a|na|\(?\s*\)?|（\s*）|\[\s*\])$/iu;
const NOISE_RE = /(未明确|空括号|提供图纸日期|图纸接收人签名|根据.*图纸|见图纸|按图纸|测试条件|10min|at\s+\d|^\s*[°℃%]+$)/iu;
const QUALIFIER_RE = /(上模|下模|模唇|侧板|模体|泵体|分配器主体|A层|B层|C层|进料口|网前|网后|上|下|左|右|前|后)/u;

loadEnv(MAIN_ENV);

const prisma = new PrismaClient();

async function main() {
  const [
    documents,
    latestResults,
    archives,
    termTypes,
    terms,
    aliases,
    termTypeAliases,
    candidates,
    occurrences,
    unitAliases,
  ] = await Promise.all([
    queryDocuments(),
    queryLatestExtractionResults(),
    queryArchives(),
    prisma.dictionaryTermType.findMany({ orderBy: [{ termType: "asc" }] }),
    prisma.dictionaryTerm.findMany({ orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }] }),
    prisma.dictionaryAlias.findMany({ orderBy: [{ termType: "asc" }, { normalizedAlias: "asc" }] }),
    prisma.dictionaryTermTypeAlias.findMany({ orderBy: [{ termType: "asc" }, { normalizedAlias: "asc" }] }),
    queryCandidates(),
    prisma.dictionaryCandidateOccurrence.findMany({
      where: { documentId: { gte: DOC_MIN, lte: DOC_MAX } },
      orderBy: [{ documentId: "asc" }, { extractionResultId: "desc" }, { fieldName: "asc" }],
    }),
    prisma.dictionaryUnitAlias.findMany({ where: { isActive: true }, orderBy: [{ canonicalUnit: "asc" }, { aliasValue: "asc" }] }),
  ]);

  const docIds = documents.map((item) => Number(item.id));
  const latestByDoc = new Map(latestResults.map((row) => [Number(row.document_id), row]));
  const archiveByDoc = new Map(archives.map((row) => [Number(row.document_id), row]));
  const termTypeByKey = new Map(termTypes.map((item) => [item.termType, item]));
  const termsByType = groupBy(terms.filter((item) => item.isActive), (item) => item.termType);
  const aliasByTypeNorm = new Map(
    aliases.filter((item) => item.isActive).map((item) => [`${item.termType}\u0000${item.normalizedAlias}`, item]),
  );
  const termByTypeCanonicalNorm = new Map(
    terms.filter((item) => item.isActive).map((item) => [`${item.termType}\u0000${normalizeAlias(item.canonicalValue)}`, item]),
  );
  const candidateStatusByTypeNorm = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.termType}\u0000${normalizeAlias(candidate.rawValue)}`;
    const list = candidateStatusByTypeNorm.get(key) ?? [];
    list.push(candidate);
    candidateStatusByTypeNorm.set(key, list);
  }

  const extracted = collectExtractedUsage(latestResults, archives);
  const scopedUsage = extracted.filter((usage) => docIds.includes(usage.documentId));
  const usageByTermType = groupBy(scopedUsage, (usage) => usage.termType);
  const termTypeFindings = auditTermTypes({ termTypes, termTypeAliases, usageByTermType, occurrences });
  const termFindings = auditTerms({
    usage: scopedUsage,
    termTypeByKey,
    termsByType,
    aliasByTypeNorm,
    termByTypeCanonicalNorm,
    candidateStatusByTypeNorm,
  });
  const aliasFindings = auditAliases({ aliases, terms, termTypeAliases, termTypeByKey });
  const candidateFindings = auditCandidates({ candidates, occurrences, termTypeByKey });
  const archiveFindings = auditArchive({ documents, latestByDoc, archiveByDoc, scopedUsage });

  const severityCounts = countBy([...termTypeFindings, ...termFindings, ...aliasFindings, ...candidateFindings, ...archiveFindings], "severity");
  const summary = {
    mode: "readonly",
    range: { documentIdMin: DOC_MIN, documentIdMax: DOC_MAX },
    generatedAt: new Date().toISOString(),
    businessLlmTokens: 0,
    documentCount: documents.length,
    latestExtractionResultCount: latestResults.length,
    archivedDocumentCount: archives.length,
    usedTermTypeCount: usageByTermType.size,
    usedFieldValueCount: scopedUsage.length,
    dictionary: {
      termTypeCount: termTypes.length,
      activeTermTypeCount: termTypes.filter((item) => item.isActive).length,
      activeTermCount: terms.filter((item) => item.isActive).length,
      activeAliasCount: aliases.filter((item) => item.isActive).length,
      activeTermTypeAliasCount: termTypeAliases.filter((item) => item.isActive).length,
      unitAliasCount: unitAliases.length,
    },
    candidateStatusCounts: countBy(candidates, "status"),
    occurrenceCount: occurrences.length,
    severityCounts,
  };

  const result = {
    summary,
    documents: documents.map((doc) => ({
      id: Number(doc.id),
      fileName: doc.file_name,
      status: doc.status,
      fileHash: doc.file_hash,
      latestExtractionResultId: latestByDoc.get(Number(doc.id))?.id ? Number(latestByDoc.get(Number(doc.id)).id) : null,
      archiveId: archiveByDoc.get(Number(doc.id))?.id ? Number(archiveByDoc.get(Number(doc.id)).id) : null,
    })),
    usedTermTypes: [...usageByTermType.entries()]
      .map(([termType, items]) => ({
        termType,
        count: items.length,
        documents: [...new Set(items.map((item) => item.documentId))].sort((a, b) => a - b),
        valueSamples: sample([...new Set(items.map((item) => String(item.value ?? "")).filter(Boolean))], 12),
      }))
      .sort((a, b) => b.count - a.count || a.termType.localeCompare(b.termType)),
    findings: {
      termTypes: termTypeFindings,
      terms: termFindings,
      aliases: aliasFindings,
      candidates: candidateFindings,
      archives: archiveFindings,
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(toJsonSafe(result), null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(result));
  console.log(JSON.stringify({ summary, outputJson: OUT_JSON, outputMarkdown: OUT_MD }, null, 2));
}

async function queryDocuments() {
  return prisma.$queryRaw`
    select id, file_name, file_hash, status
    from production_config_agent.documents
    where id between ${DOC_MIN} and ${DOC_MAX}
    order by id asc
  `;
}

async function queryLatestExtractionResults() {
  return prisma.$queryRaw`
    select distinct on (document_id)
      id, document_id, extraction_json, normalized_extraction_json, dictionary_proposals, warnings, created_at
    from production_config_agent.extraction_results
    where document_id between ${DOC_MIN} and ${DOC_MAX}
    order by document_id, created_at desc, id desc
  `;
}

async function queryArchives() {
  return prisma.$queryRaw`
    select id, document_id, extraction_result_id, dirty_reason, product_number, contract_number, customer_id, country
    from production_config_agent.contract_archives
    where document_id between ${DOC_MIN} and ${DOC_MAX}
    order by document_id asc, id desc
  `;
}

async function queryCandidates() {
  return prisma.$queryRaw`
    select distinct
      c.id,
      c.document_id as "documentId",
      c.extraction_result_id as "extractionResultId",
      c.term_type as "termType",
      c.raw_value as "rawValue",
      c.normalized_raw_value as "normalizedRawValue",
      c.proposed_canonical_value as "proposedCanonicalValue",
      c.proposed_term_id as "proposedTermId",
      c.reason,
      c.evidence,
      c.confidence,
      c.status,
      c.reviewed_by as "reviewedBy",
      c.reviewed_at as "reviewedAt",
      c.created_at as "createdAt",
      c.updated_at as "updatedAt",
      c.source_product_type as "sourceProductType",
      c.item_index as "itemIndex",
      c.resolver_status as "resolverStatus",
      c.resolver_route as "resolverRoute",
      c.resolver_score as "resolverScore",
      c.resolver_risk_level as "resolverRiskLevel",
      c.resolver_decision_jsonb as "resolverDecisionJsonb",
      c.last_resolved_at as "lastResolvedAt"
    from production_config_agent.dictionary_candidates c
    where c.document_id between ${DOC_MIN} and ${DOC_MAX}
       or exists (
         select 1
         from production_config_agent.dictionary_candidate_occurrences o
         where o.candidate_id = c.id
           and o.document_id between ${DOC_MIN} and ${DOC_MAX}
       )
    order by c.status asc, c.term_type asc, c.raw_value asc
  `;
}

function collectExtractedUsage(latestResults, archives) {
  const usage = [];
  for (const row of latestResults) {
    const documentId = Number(row.document_id);
    const extractionResultId = Number(row.id);
    collectFromExtractionJson(usage, documentId, extractionResultId, row.normalized_extraction_json, "normalized_extraction_json");
    collectFromExtractionJson(usage, documentId, extractionResultId, row.extraction_json, "extraction_json");
  }
  for (const archive of archives) {
    for (const [key, value] of Object.entries({
      product_number: archive.product_number,
      contract_number: archive.contract_number,
      customer_id: archive.customer_id,
      country: archive.country,
    })) {
      if (value !== null && value !== undefined && String(value).trim()) {
        usage.push({
          documentId: Number(archive.document_id),
          extractionResultId: archive.extraction_result_id ? Number(archive.extraction_result_id) : null,
          itemIndex: null,
          termType: key,
          value: String(value).trim(),
          source: "archive_document_info",
          path: key,
        });
      }
    }
  }
  return dedupeUsage(usage);
}

function collectFromExtractionJson(usage, documentId, extractionResultId, json, source) {
  const root = objectRecord(json);
  const extraction = objectRecord(root.extraction);
  const documentInfo = objectRecord(root.document_info ?? extraction.document_info);
  for (const [key, value] of Object.entries(documentInfo)) collectValue(usage, documentId, extractionResultId, null, key, value, source, `document_info.${key}`);
  const items = Array.isArray(root.items) ? root.items : Array.isArray(extraction.items) ? extraction.items : [];
  items.forEach((item, index) => {
    collectItem(usage, documentId, extractionResultId, index, item, source, `items.${index}`);
  });
}

function collectItem(usage, documentId, extractionResultId, itemIndex, item, source, basePath) {
  const record = objectRecord(item);
  for (const [key, value] of Object.entries(record)) {
    if (["fields", "normalized_fields", "raw_fields", "configuration", "configs", "attributes"].includes(key)) continue;
    collectValue(usage, documentId, extractionResultId, itemIndex, key, value, source, `${basePath}.${key}`);
  }
  for (const fieldContainer of ["fields", "normalized_fields", "raw_fields", "configuration", "configs", "attributes"]) {
    collectFields(usage, documentId, extractionResultId, itemIndex, record[fieldContainer], source, `${basePath}.${fieldContainer}`);
  }
}

function collectFields(usage, documentId, extractionResultId, itemIndex, fields, source, pathPrefix) {
  if (Array.isArray(fields)) {
    fields.forEach((field, index) => {
      const record = objectRecord(field);
      const termType = stringOrNull(record.termType ?? record.term_type ?? record.fieldName ?? record.field_name ?? record.name ?? record.key);
      const value = record.normalizedValue ?? record.normalized_value ?? record.canonicalValue ?? record.canonical_value ?? record.value ?? record.rawValue ?? record.raw_value;
      if (termType) collectValue(usage, documentId, extractionResultId, itemIndex, termType, value, source, `${pathPrefix}.${index}`);
    });
    return;
  }
  const record = objectRecord(fields);
  for (const [termType, value] of Object.entries(record)) collectValue(usage, documentId, extractionResultId, itemIndex, termType, value, source, `${pathPrefix}.${termType}`);
}

function collectValue(usage, documentId, extractionResultId, itemIndex, termType, value, source, valuePath) {
  const cleanTermType = String(termType ?? "").trim();
  if (!cleanTermType || cleanTermType === "undefined" || cleanTermType === "null") return;
  if (["evidence", "source", "warnings", "dictionary", "raw", "original"].includes(cleanTermType)) return;
  for (const item of flattenValues(value)) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    usage.push({ documentId, extractionResultId, itemIndex, termType: cleanTermType, value: text, source, path: valuePath });
  }
}

function flattenValues(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  const record = objectRecord(value);
  if (record.canonicalValue || record.canonical_value || record.normalizedValue || record.normalized_value || record.value || record.rawValue || record.raw_value) {
    return flattenValues(record.canonicalValue ?? record.canonical_value ?? record.normalizedValue ?? record.normalized_value ?? record.value ?? record.rawValue ?? record.raw_value);
  }
  return [];
}

function dedupeUsage(usage) {
  const seen = new Set();
  const result = [];
  for (const item of usage) {
    const key = [item.documentId, item.extractionResultId, item.itemIndex, item.termType, item.value, item.source, item.path].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function auditTermTypes({ termTypes, termTypeAliases, usageByTermType, occurrences }) {
  const findings = [];
  const byKey = new Map(termTypes.map((item) => [item.termType, item]));
  const activeAliasByType = groupBy(termTypeAliases.filter((item) => item.isActive), (item) => item.termType);
  const activeAliasByNormalized = new Map(termTypeAliases.filter((item) => item.isActive).map((item) => [item.normalizedAlias, item]));
  for (const [termType, usage] of usageByTermType.entries()) {
    const row = byKey.get(termType);
    const sourceCounts = countBy(usage, "source");
    if (!row) {
      const matchedAlias = activeAliasByNormalized.get(normalizeAlias(termType));
      const hasFinalUsage = Boolean(sourceCounts.normalized_extraction_json || sourceCounts.archive_document_info);
      const isStructural = isStructuralField(termType);
      findings.push(finding(
        hasFinalUsage && !matchedAlias && !isStructural ? "error" : "warning",
        matchedAlias
          ? "raw_field_retained_but_termtype_alias_exists"
          : isStructural
            ? "structural_field_without_dictionary_definition"
            : "missing_termtype_definition",
        {
          termType,
          occurrenceCount: usage.length,
          sourceCounts,
          matchedAlias: matchedAlias
            ? { aliasId: Number(matchedAlias.id), canonicalTermType: matchedAlias.termType, aliasValue: matchedAlias.aliasValue }
            : null,
          documents: docsOf(usage),
          samples: samplesOf(usage),
        },
      ));
      continue;
    }
    if (!row.isActive) findings.push(finding("warning", "inactive_used_termtype", { termType, occurrenceCount: usage.length, documents: docsOf(usage) }));
    if (!stringOrNull(row.displayName) || normalizeAlias(row.displayName) === normalizeAlias(row.termType)) {
      findings.push(finding("warning", "weak_termtype_display_name", { termType, displayName: row.displayName, occurrenceCount: usage.length }));
    }
    if (!stringOrNull(row.description) || String(row.description).trim().length < 4) {
      findings.push(finding("warning", "missing_termtype_description", { termType, displayName: row.displayName, occurrenceCount: usage.length }));
    }
    if (!["enum", "enums", "text", "number", "number_unit", "boolean", "date"].includes(String(row.valueKind))) {
      findings.push(finding("warning", "unexpected_termtype_value_kind", { termType, valueKind: row.valueKind }));
    }
    if (!activeAliasByType.get(termType)?.length) {
      const rawFieldEvidence = occurrences.filter((item) => item.fieldName === termType).slice(0, 5);
      findings.push(finding("info", "no_termtype_alias_for_used_termtype", {
        termType,
        occurrenceCount: usage.length,
        rawFieldSamples: rawFieldEvidence.map((item) => ({ documentId: Number(item.documentId), rawValue: item.rawValue })),
      }));
    }
  }
  const unusedActiveTermTypes = termTypes.filter((item) => item.isActive && !usageByTermType.has(item.termType));
  if (unusedActiveTermTypes.length) {
    findings.push(finding("info", "active_termtypes_unused_in_doc0_100", {
      count: unusedActiveTermTypes.length,
      samples: unusedActiveTermTypes.slice(0, 20).map((item) => ({ termType: item.termType, displayName: item.displayName, valueKind: item.valueKind })),
    }));
  }
  return findings.sort(sortFindings);
}

function isStructuralField(termType) {
  return [
    "item_index",
    "item_name",
    "item_quantity",
    "product_type_hint",
    "itemProductTypeHint",
    "itemProductTypeHintRawValue",
    "itemProductTypeHintConfidence",
    "itemProductTypeHintDisplayName",
    "contract_number",
    "product_number",
    "order_number",
    "customer_id",
    "country",
    "usage_market",
    "order_date",
    "delivery_date",
    "contract_delivery_date",
  ].includes(termType);
}

function auditTerms({ usage, termTypeByKey, termsByType, aliasByTypeNorm, termByTypeCanonicalNorm, candidateStatusByTypeNorm }) {
  const findings = [];
  const grouped = groupBy(usage, (item) => `${item.termType}\u0000${normalizeAlias(item.value)}`);
  for (const [key, items] of grouped.entries()) {
    const [termType, normalizedValue] = key.split("\u0000");
    const value = items[0]?.value ?? "";
    const type = termTypeByKey.get(termType);
    if (!type) continue;
    const valueKind = String(type.valueKind ?? "");
    if (PLACEHOLDER_RE.test(String(value))) {
      findings.push(finding("warning", "placeholder_value_present", { termType, value, documents: docsOf(items), sourcePaths: pathsOf(items) }));
      continue;
    }
    if (NOISE_RE.test(String(value))) {
      findings.push(finding("warning", "noise_like_value_present", { termType, value, valueKind, documents: docsOf(items), sourcePaths: pathsOf(items) }));
    }
    if (ENUM_KINDS.has(valueKind)) {
      const directTerm = termByTypeCanonicalNorm.get(`${termType}\u0000${normalizedValue}`);
      const alias = aliasByTypeNorm.get(`${termType}\u0000${normalizedValue}`);
      const candidates = candidateStatusByTypeNorm.get(`${termType}\u0000${normalizedValue}`) ?? [];
      if (!directTerm && !alias) {
        findings.push(finding(candidates.some((candidate) => candidate.status === "pending") ? "warning" : "error", "enum_value_without_active_term_or_alias", {
          termType,
          value,
          occurrenceCount: items.length,
          documents: docsOf(items),
          candidateStatuses: candidates.map((candidate) => ({ id: Number(candidate.id), status: candidate.status, proposedCanonicalValue: candidate.proposedCanonicalValue })),
          sourcePaths: pathsOf(items),
        }));
      }
    }
    if (NON_VALUE_KINDS.has(valueKind) && (aliasByTypeNorm.get(`${termType}\u0000${normalizedValue}`) || termByTypeCanonicalNorm.get(`${termType}\u0000${normalizedValue}`))) {
      findings.push(finding("info", "dictionary_value_defined_for_non_enum_termtype", {
        termType,
        value,
        valueKind,
        documents: docsOf(items),
      }));
    }
    if (QUALIFIER_RE.test(String(value)) && ENUM_KINDS.has(valueKind)) {
      findings.push(finding("info", "qualifier_embedded_in_enum_value", { termType, value, documents: docsOf(items), sourcePaths: pathsOf(items) }));
    }
  }
  for (const [termType, list] of termsByType.entries()) {
    const normalizedGroups = groupBy(list, (item) => normalizeAlias(item.canonicalValue));
    for (const [normalized, duplicateTerms] of normalizedGroups.entries()) {
      if (duplicateTerms.length > 1) findings.push(finding("error", "duplicate_active_terms_same_normalized_value", {
        termType,
        normalized,
        terms: duplicateTerms.map((item) => ({ id: Number(item.id), canonicalValue: item.canonicalValue, displayName: item.displayName })),
      }));
    }
    for (const term of list) {
      if (PLACEHOLDER_RE.test(term.canonicalValue)) findings.push(finding("warning", "placeholder_dictionary_term", { termType, termId: Number(term.id), canonicalValue: term.canonicalValue }));
      if (!stringOrNull(term.displayName)) findings.push(finding("info", "term_missing_display_name", { termType, termId: Number(term.id), canonicalValue: term.canonicalValue }));
      if (!stringOrNull(term.description)) findings.push(finding("info", "term_missing_description", { termType, termId: Number(term.id), canonicalValue: term.canonicalValue }));
    }
  }
  return findings.sort(sortFindings);
}

function auditAliases({ aliases, terms, termTypeAliases, termTypeByKey }) {
  const findings = [];
  const activeTermsById = new Map(terms.filter((item) => item.isActive).map((item) => [String(item.id), item]));
  for (const alias of aliases.filter((item) => item.isActive)) {
    const term = activeTermsById.get(String(alias.termId));
    if (!term) {
      findings.push(finding("error", "alias_points_to_missing_or_inactive_term", {
        aliasId: Number(alias.id),
        termType: alias.termType,
        termId: Number(alias.termId),
        aliasValue: alias.aliasValue,
      }));
      continue;
    }
    if (term.termType !== alias.termType) {
      findings.push(finding("error", "alias_termtype_mismatch", {
        aliasId: Number(alias.id),
        aliasTermType: alias.termType,
        termId: Number(alias.termId),
        termTermType: term.termType,
        aliasValue: alias.aliasValue,
        canonicalValue: term.canonicalValue,
      }));
    }
    if (PLACEHOLDER_RE.test(alias.aliasValue) || NOISE_RE.test(alias.aliasValue)) {
      findings.push(finding("warning", "noise_or_placeholder_alias", {
        aliasId: Number(alias.id),
        termType: alias.termType,
        aliasValue: alias.aliasValue,
        canonicalValue: term.canonicalValue,
      }));
    }
  }
  const termTypeAliasGroups = groupBy(termTypeAliases.filter((item) => item.isActive), (item) => item.normalizedAlias);
  for (const [normalized, list] of termTypeAliasGroups.entries()) {
    const types = [...new Set(list.map((item) => item.termType))];
    if (types.length > 1) findings.push(finding("error", "termtype_alias_points_to_multiple_termtypes", {
      normalizedAlias: normalized,
      aliases: list.map((item) => ({ id: Number(item.id), termType: item.termType, aliasValue: item.aliasValue })),
    }));
  }
  for (const alias of termTypeAliases.filter((item) => item.isActive)) {
    if (!termTypeByKey.has(alias.termType)) {
      findings.push(finding("error", "termtype_alias_points_to_missing_termtype", {
        aliasId: Number(alias.id),
        termType: alias.termType,
        aliasValue: alias.aliasValue,
      }));
    }
  }
  return findings.sort(sortFindings);
}

function auditCandidates({ candidates, occurrences, termTypeByKey }) {
  const findings = [];
  const occurrenceCountByCandidate = countMap(occurrences, (item) => String(item.candidateId));
  const pending = candidates.filter((item) => item.status === "pending");
  for (const candidate of pending) {
    const evidence = objectRecord(candidate.evidence);
    const candidateType = String(evidence.candidateType ?? inferCandidateType(candidate.termType));
    const termType = termTypeByKey.get(candidate.termType);
    const valueKind = termType ? String(termType.valueKind) : null;
    const severity = candidateType === "value" && valueKind && !ENUM_KINDS.has(valueKind) ? "error" : "warning";
    findings.push(finding(severity, "pending_candidate_in_doc0_100", {
      candidateId: Number(candidate.id),
      candidateType,
      termType: candidate.termType,
      rawValue: candidate.rawValue,
      valueKind,
      occurrenceCount: occurrenceCountByCandidate.get(String(candidate.id)) ?? 0,
      recommendedAction: recommendCandidateAction(candidate, candidateType, valueKind),
    }));
  }
  for (const candidate of candidates) {
    const evidence = objectRecord(candidate.evidence);
    const candidateType = String(evidence.candidateType ?? inferCandidateType(candidate.termType));
    const valueKind = termTypeByKey.get(candidate.termType)?.valueKind ?? null;
    if (candidateType === "value" && valueKind && !ENUM_KINDS.has(String(valueKind)) && ["approved", "approved_alias", "split"].includes(candidate.status)) {
      findings.push(finding("warning", "historical_value_candidate_on_non_enum_termtype", {
        candidateId: Number(candidate.id),
        termType: candidate.termType,
        rawValue: candidate.rawValue,
        status: candidate.status,
        valueKind,
      }));
    }
  }
  return findings.sort(sortFindings);
}

function auditArchive({ documents, latestByDoc, archiveByDoc, scopedUsage }) {
  const findings = [];
  for (const doc of documents) {
    const id = Number(doc.id);
    const latest = latestByDoc.get(id);
    const archive = archiveByDoc.get(id);
    if (!latest) findings.push(finding("error", "document_missing_extraction_result", { documentId: id, fileName: doc.file_name }));
    if (!archive) findings.push(finding("warning", "document_missing_archive", { documentId: id, fileName: doc.file_name }));
    if (archive?.dirty_reason) findings.push(finding("error", "document_archive_dirty", { documentId: id, archiveId: Number(archive.id), dirtyReason: archive.dirty_reason }));
  }
  const documentInfoUsages = scopedUsage.filter((item) => item.source === "archive_document_info");
  const missingInfoDocs = documents
    .map((doc) => Number(doc.id))
    .filter((id) => !documentInfoUsages.some((item) => item.documentId === id));
  if (missingInfoDocs.length) findings.push(finding("warning", "archive_document_info_empty_or_missing", { count: missingInfoDocs.length, documents: missingInfoDocs.slice(0, 30) }));
  return findings.sort(sortFindings);
}

function recommendCandidateAction(candidate, candidateType, valueKind) {
  if (candidateType === "term_type") return "review field alias/create termType/use qualifier; do not auto-approve without field evidence";
  if (PLACEHOLDER_RE.test(candidate.rawValue) || NOISE_RE.test(candidate.rawValue)) return "reject_noise";
  if (candidateType === "value" && valueKind && !ENUM_KINDS.has(String(valueKind))) return "reject extraction/noise or change termType policy; non-enum should not collect value candidates";
  if (candidateType === "value" && QUALIFIER_RE.test(candidate.rawValue)) return "use_qualifier or split_value";
  return "dictionary_governance_review";
}

function inferCandidateType(termType) {
  if (termType === "unit" || termType.endsWith("_unit")) return "unit";
  if (termType === "field" || termType === "term_type" || termType.startsWith("unknown_field")) return "term_type";
  return "value";
}

function renderMarkdown(result) {
  const lines = [];
  const { summary } = result;
  lines.push("# Document 0-100 Term / TermType Dictionary Audit");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Mode: readonly`);
  lines.push(`- Document range: ${summary.range.documentIdMin}-${summary.range.documentIdMax}`);
  lines.push(`- Documents: ${summary.documentCount}`);
  lines.push(`- Latest extraction results: ${summary.latestExtractionResultCount}`);
  lines.push(`- Archived documents: ${summary.archivedDocumentCount}`);
  lines.push(`- Used termTypes: ${summary.usedTermTypeCount}`);
  lines.push(`- Used field values: ${summary.usedFieldValueCount}`);
  lines.push(`- Business LLM token: ${summary.businessLlmTokens}`);
  lines.push(`- Severity counts: ${JSON.stringify(summary.severityCounts)}`);
  lines.push(`- Candidate status counts in scope: ${JSON.stringify(summary.candidateStatusCounts)}`);
  lines.push("");
  lines.push("## Used TermTypes");
  lines.push("");
  lines.push("| termType | count | docs | samples |");
  lines.push("| --- | ---: | --- | --- |");
  for (const item of result.usedTermTypes.slice(0, 80)) {
    lines.push(`| ${esc(item.termType)} | ${item.count} | ${esc(item.documents.join(", "))} | ${esc(item.valueSamples.join("; "))} |`);
  }
  lines.push("");
  lines.push("## Findings");
  for (const [section, findings] of Object.entries(result.findings)) {
    lines.push("");
    lines.push(`### ${section}`);
    lines.push("");
    if (!findings.length) {
      lines.push("- No findings.");
      continue;
    }
    lines.push("| severity | type | detail |");
    lines.push("| --- | --- | --- |");
    for (const item of findings.slice(0, 200)) {
      lines.push(`| ${item.severity} | ${esc(item.type)} | ${esc(compactDetail(item))} |`);
    }
    if (findings.length > 200) lines.push(`| info | truncated | ${findings.length - 200} additional findings in JSON |`);
  }
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- JSON: ${OUT_JSON}`);
  lines.push(`- Markdown: ${OUT_MD}`);
  return lines.join("\n");
}

function compactDetail(item) {
  const clone = { ...item };
  delete clone.severity;
  delete clone.type;
  return JSON.stringify(clone).slice(0, 900);
}

function finding(severity, type, detail) {
  return { severity, type, ...detail };
}

function sortFindings(left, right) {
  const rank = { error: 0, warning: 1, info: 2 };
  return (rank[left.severity] ?? 9) - (rank[right.severity] ?? 9) || String(left.type).localeCompare(String(right.type));
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function countBy(items, key) {
  const result = {};
  for (const item of items) {
    const value = String(item[key] ?? "unknown");
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function countMap(items, keyFn) {
  const result = new Map();
  for (const item of items) {
    const key = keyFn(item);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function docsOf(items) {
  return [...new Set(items.map((item) => item.documentId))].sort((a, b) => a - b).slice(0, 30);
}

function pathsOf(items) {
  return sample([...new Set(items.map((item) => item.path).filter(Boolean))], 10);
}

function samplesOf(items) {
  return sample([...new Set(items.map((item) => item.value).filter(Boolean))], 10);
}

function sample(items, max) {
  return items.slice(0, max);
}

function stringOrNull(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeAlias(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:，,。；;、/\\|()[\]（）【】"'“”‘’]/g, "")
    .toLowerCase();
}

function esc(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function toJsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return Number(item);
      if (item instanceof Date) return item.toISOString();
      if (typeof item === "object" && item?.constructor?.name === "Decimal") return Number(item);
      return item;
    }),
  );
}

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  if (!process.env.DATABASE_URL) throw new Error(`DATABASE_URL not found in ${filePath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
