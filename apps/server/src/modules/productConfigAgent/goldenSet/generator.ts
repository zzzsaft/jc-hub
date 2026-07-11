import fs from "node:fs";
import path from "node:path";
import {
  ANNOTATION_SCHEMA_VERSION,
  ERP_SAMPLE_TARGET,
  GOLDEN_SET_SEED,
  GOLDEN_SET_VERSION,
  PACKAGE_SAMPLE_TARGET,
  annotationSchema,
  readTsv,
  sha256File,
  sha256Text,
  stableRank,
  validatePackets,
  type DocumentSourceMetadata,
  type ErpCandidate,
  type ErpPacket,
  type InputRow,
  type PackagePacket,
  type SourceMetadataSnapshot,
} from "./model.js";

const DISCOVERY_RULE_VERSION = "product-package-discovery-v3.0";
const ERP_LEDGER_VERSION = "erp-identity-ledger-v1.1";

export type GoldenInputs = ReturnType<typeof loadGoldenInputs>;

export function loadGoldenInputs(discoveryDir: string, ledgerDir: string) {
  const files = {
    packages: path.join(discoveryDir, "document-product-packages.tsv"),
    products: path.join(discoveryDir, "document-products.tsv"),
    discoverySummary: path.join(discoveryDir, "summary.json"),
    links: path.join(ledgerDir, "erp-identity-links.tsv"),
    ledgerSummary: path.join(ledgerDir, "summary.json"),
    ledgerSnapshot: path.join(ledgerDir, "input-snapshot.json"),
  };
  const inputs = {
    files,
    packages: readTsv(files.packages), products: readTsv(files.products), links: readTsv(files.links),
    discoverySummary: JSON.parse(fs.readFileSync(files.discoverySummary, "utf8")),
    ledgerSummary: JSON.parse(fs.readFileSync(files.ledgerSummary, "utf8")),
    ledgerSnapshot: JSON.parse(fs.readFileSync(files.ledgerSnapshot, "utf8")),
  };
  validateInputs(inputs);
  return inputs;
}

export function selectErpRows(inputs: GoldenInputs): InputRow[] {
  const mandatory = inputs.links.filter((row) => riskPatterns(row).some((risk) => ["GD-E70", "0918", "091001", "P504"].includes(risk)));
  const selected = new Map(mandatory.map((row) => [itemKey(row), row]));
  const quota = ERP_SAMPLE_TARGET / 3;
  for (const status of ["matched", "ambiguous", "unresolved"]) {
    const existing = [...selected.values()].filter((row) => row.identity_status === status).length;
    inputs.links.filter((row) => row.identity_status === status && !selected.has(itemKey(row)))
      .sort((left, right) => stableRank(`erp:${itemKey(left)}`).localeCompare(stableRank(`erp:${itemKey(right)}`)))
      .slice(0, Math.max(0, quota - existing))
      .forEach((row) => selected.set(itemKey(row), row));
  }
  const rows = [...selected.values()].sort(rowOrder);
  if (rows.length !== ERP_SAMPLE_TARGET) throw new Error(`ERP sample must contain ${ERP_SAMPLE_TARGET} rows, got ${rows.length}`);
  return rows;
}

export function requiredErpProductKeys(rows: InputRow[]): Array<{ company: string; part_num: string }> {
  const result = new Map<string, { company: string; part_num: string }>();
  for (const row of rows) {
    for (const candidate of candidates(row, new Map())) {
      if (!candidate.company || !candidate.part_num) continue;
      result.set(`${candidate.company}:${candidate.part_num}`, { company: candidate.company, part_num: candidate.part_num });
    }
  }
  return [...result.values()].sort((a, b) => `${a.company}:${a.part_num}`.localeCompare(`${b.company}:${b.part_num}`));
}

export function buildGoldenSet(inputs: GoldenInputs, sourceMetadata: SourceMetadataSnapshot) {
  validateSourceMetadata(inputs, sourceMetadata);
  const metadata = new Map(sourceMetadata.documents.map((row) => [row.document_id, row]));
  const erpProducts = new Map(sourceMetadata.erp_products.map((row) => [`${row.company}:${row.part_num}`, row]));
  const lengths = sourceMetadata.documents.map((row) => row.source_text_length).sort((a, b) => a - b);
  const lengthThresholds = { p10: quantile(lengths, 0.1), p90: quantile(lengths, 0.9) };
  const productsByDocument = group(inputs.products, "document_id");
  const linksByDocument = group(inputs.links, "document_id");
  const packageRows = selectPackages(inputs, metadata, linksByDocument);
  const erpRows = selectErpRows(inputs);
  const packages = packageRows.map((row) => packagePacket(row, productsByDocument.get(row.document_id) ?? [], linksByDocument.get(row.document_id) ?? [], metadata.get(row.document_id)!, lengthThresholds));
  const erp = erpRows.map((row) => erpPacket(row, metadata.get(row.document_id)!, erpProducts, lengthThresholds));
  const validation = validatePackets(packages, erp, { package_packets: PACKAGE_SAMPLE_TARGET, erp_packets: ERP_SAMPLE_TARGET, no_product_evidence: 18 });
  const noEvidenceIds = inputs.packages.filter((row) => Number(row.package_product_count) === 0).map((row) => row.document_id);
  const selectedPackageIds = new Set(packages.map((packet) => String(packet.source.document_id)));
  const missingNoEvidence = noEvidenceIds.filter((id) => !selectedPackageIds.has(id));
  if (missingNoEvidence.length) validation.errors.push(`missing no-product-evidence documents: ${missingNoEvidence.join(",")}`);
  validation.passed = validation.errors.length === 0;
  const manifest = buildManifest(inputs, sourceMetadata, packages, erp, validation, lengthThresholds);
  return { packages, erp, validation, manifest, annotationSchema: annotationSchema() };
}

function selectPackages(inputs: GoldenInputs, metadata: Map<string, DocumentSourceMetadata>, linksByDocument: Map<string, InputRow[]>) {
  const lengths = [...metadata.values()].map((row) => row.source_text_length).sort((a, b) => a - b);
  const p10 = quantile(lengths, 0.1);
  const p90 = quantile(lengths, 0.9);
  const mandatory = new Map<string, InputRow>();
  const add = (rows: InputRow[]) => rows.forEach((row) => mandatory.set(row.document_id, row));
  add(inputs.packages.filter((row) => Number(row.package_product_count) === 0));
  add(inputs.packages.filter((row) => (linksByDocument.get(row.document_id) ?? []).some((link) => riskPatterns(link).some((risk) => ["GD-E70", "0918", "091001", "P504"].includes(risk)))));
  add(inputs.packages.filter((row) => Boolean(row.held_component_evidence_pending_erp_identity)));
  add(inputs.packages.filter((row) => {
    const length = metadata.get(row.document_id)?.source_text_length ?? 0;
    return length <= p10 || length >= p90;
  }));
  for (const field of ["has_accessory_signal", "has_spare_signal", "has_component_signal"] as const) {
    add(inputs.packages.filter((row) => metadata.get(row.document_id)?.[field])
      .sort((a, b) => stableRank(`${field}:${a.document_id}`).localeCompare(stableRank(`${field}:${b.document_id}`))).slice(0, 12));
  }
  const selected = new Map(mandatory);
  const strata = new Map<string, InputRow[]>();
  for (const row of inputs.packages.filter((item) => !selected.has(item.document_id))) {
    const meta = metadata.get(row.document_id)!;
    const profile = identityProfile(linksByDocument.get(row.document_id) ?? []);
    const key = [row.sample_class, row.has_plan, packageSize(row), lengthBucket(meta.source_text_length, p10, p90), profile].join("|");
    strata.set(key, [...(strata.get(key) ?? []), row]);
  }
  for (const rows of strata.values()) rows.sort((a, b) => stableRank(`package:${a.document_id}`).localeCompare(stableRank(`package:${b.document_id}`)));
  while (selected.size < PACKAGE_SAMPLE_TARGET) {
    let added = false;
    for (const key of [...strata.keys()].sort()) {
      const next = strata.get(key)?.shift();
      if (!next) continue;
      selected.set(next.document_id, next);
      added = true;
      if (selected.size === PACKAGE_SAMPLE_TARGET) break;
    }
    if (!added) break;
  }
  if (selected.size !== PACKAGE_SAMPLE_TARGET) throw new Error(`Package sample must contain ${PACKAGE_SAMPLE_TARGET} documents, got ${selected.size}`);
  return [...selected.values()].sort((a, b) => Number(a.document_id) - Number(b.document_id));
}

function packagePacket(row: InputRow, products: InputRow[], links: InputRow[], metadata: DocumentSourceMetadata, lengthThresholds: { p10: number; p90: number }): PackagePacket {
  const items = products.sort((a, b) => Number(a.package_item_order) - Number(b.package_item_order)).map((product) => ({
    prediction_item_id: `doc:${row.document_id}:item:${product.package_item_order}`,
    item_name: product.product_name,
    product_family: product.product_type,
    product_subtype: null,
    item_role: "peer_product" as const,
    model: null,
    peer_group_id: `doc:${row.document_id}:peer-group:1`,
    source_item_role_compatibility: product.item_role_compatibility,
    source_dimensions: { die_product_family: product.die_product_family || null, finished_form: product.finished_form || null, configuration_family: product.configuration_family || null },
    evidence_sources: split(product.evidence_sources),
  }));
  const risks = packageRisks(row, links, metadata, lengthThresholds.p10, lengthThresholds.p90);
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION, layer: "product_package", sample_id: `package:${row.document_id}`,
    source: {
      document_id: row.document_id, package_source_id: `stage-2.1-package:${row.document_id}`,
      package_item_source_ids: products.map((product) => `stage-2.1-product:${row.document_id}:${product.package_item_order}`),
      business_date: row.business_date, date_source: row.date_source,
      held_component_evidence: row.held_component_evidence_pending_erp_identity || null,
      unresolved_reason: row.unresolved_reason || null,
    },
    strata: {
      plan_status: row.has_plan === "true" ? "has_plan" : "without_plan",
      sample_class: row.sample_class,
      template_cohort: row.has_plan === "true" ? "planned_template_proxy" : "unplanned_legacy_template_proxy",
      document_cohort: documentCohort(row), length_bucket: lengthBucket(metadata.source_text_length, lengthThresholds.p10, lengthThresholds.p90),
      package_size: packageSize(row), identity_profile: identityProfile(links), risk_patterns: risks,
    },
    selection_reasons: unique([...risks, `stratified:${row.sample_class}`, `plan:${row.has_plan === "true" ? "present" : "absent"}`]),
    prediction: { evidence_sufficiency: items.length ? "sufficient" : "insufficient_evidence", items },
    annotation_status: "pending", annotations: { annotator_a: null, annotator_b: null, adjudication: null }, gold: null,
  };
}

function erpPacket(row: InputRow, metadata: DocumentSourceMetadata, names: Map<string, SourceMetadataSnapshot["erp_products"][number]>, lengthThresholds: { p10: number; p90: number }): ErpPacket {
  const status = row.identity_status as "matched" | "ambiguous" | "unresolved";
  const risks = riskPatterns(row);
  return {
    schema_version: ANNOTATION_SCHEMA_VERSION, layer: "erp_identity", sample_id: `erp:${row.document_id}:${row.package_item_order}`,
    source: {
      document_id: row.document_id, package_item_order: Number(row.package_item_order), source_product_name: row.product_name,
      source_product_family: row.product_type, source_item_role_compatibility: row.item_role_compatibility,
      ledger_source_id: `stage-2.1-ledger:${row.document_id}:${row.package_item_order}`,
    },
    strata: {
      identity_status: status, plan_status: row.has_plan === "true" ? "has_plan" : "without_plan",
      template_cohort: row.has_plan === "true" ? "planned_template_proxy" : "unplanned_legacy_template_proxy",
      length_bucket: lengthBucket(metadata.source_text_length, lengthThresholds.p10, lengthThresholds.p90), risk_patterns: risks.length ? risks : ["standard"],
    },
    selection_reasons: unique([`identity_status:${status}`, ...(risks.length ? risks : ["deterministic_status_fill"])]),
    prediction: {
      identity_status: status, confidence: Number(row.confidence || 0), top_candidates: candidates(row, names).slice(0, 3),
      evidence: {
        evidence_source: row.evidence_source || null, evidence_product_number: row.evidence_product_number || null,
        evidence_order_number: row.evidence_order_number || null, expected_erp_prod_codes: split(row.expected_erp_prod_codes),
        reason_codes: split(row.reasons), blocker: row.blocker || null,
      },
    },
    annotation_status: "pending", annotations: { annotator_a: null, annotator_b: null, adjudication: null }, gold: null,
  };
}

function buildManifest(inputs: GoldenInputs, source: SourceMetadataSnapshot, packages: PackagePacket[], erp: ErpPacket[], validation: ReturnType<typeof validatePackets>, lengthThresholds: { p10: number; p90: number }) {
  const sourceText = `${JSON.stringify(source, null, 2)}\n`;
  return {
    schema_version: "product-config-golden-manifest-v1", golden_set_version: GOLDEN_SET_VERSION, sealed: true, as_of: "2026-07-10",
    rule_versions: { product_package: DISCOVERY_RULE_VERSION, erp_identity: ERP_LEDGER_VERSION }, dictionary_version: 1522,
    sample_selection: {
      seed: GOLDEN_SET_SEED, package_target: PACKAGE_SAMPLE_TARGET, erp_target: ERP_SAMPLE_TARGET,
      source_length_thresholds: lengthThresholds,
      package_sample_ids: packages.map((packet) => packet.sample_id), erp_sample_ids: erp.map((packet) => packet.sample_id),
      package_counts: countBy(packages, (packet) => String(packet.strata.plan_status)),
      erp_counts: countBy(erp, (packet) => packet.prediction.identity_status),
    },
    input_files: Object.fromEntries(Object.entries(inputs.files).map(([key, file]) => [key, { path: path.relative(process.cwd(), file), sha256: sha256File(file) }])),
    fixed_input_prediction_baseline: {
      packages: inputs.packages.length,
      product_rows: inputs.links.length,
      without_plan: inputs.packages.filter((row) => row.has_plan === "false").length,
      no_product_evidence_documents: inputs.packages.filter((row) => Number(row.package_product_count) === 0).length,
      erp_status_counts: countBy(inputs.links, (row) => row.identity_status),
      erp_predicted_coverage: inputs.links.filter((row) => row.identity_status === "matched").length / inputs.links.length,
      note: "Full fixed-input prediction distribution; this is not a quality metric until human gold exists.",
    },
    source_metadata_sha256: sha256Text(sourceText), annotation_schema_version: ANNOTATION_SCHEMA_VERSION,
    thresholds: {
      minimum_adjudicated: { product_package: 120, erp_identity: 180 },
      item_boundary_f1: { min: 0.9 }, product_family_accuracy: { min: 0.9 }, product_subtype_macro_f1: { min: 0.85 },
      item_role_macro_f1: { min: 0.85 }, package_exact_match: { min: 0.75 }, erp_top1_precision: { min: 0.98 },
      erp_top3_recall: { min: 0.9 }, erp_coverage: { min: 0.15 }, erp_false_auto_match_rate: { max: 0.02 }, erp_abstention_correctness: { min: 0.95 },
    },
    annotation_state: { human_gold_present: false, package_gold_rows: 0, erp_gold_rows: 0, metrics_available: false },
    validation, safeguards: { database_writes: 0, dictionary_writes: 0, normalization_runs: 0, refresh_jobs: 0, workers_started: 0, business_llm_calls: 0, erp_writes: 0 },
  };
}

function validateInputs(inputs: any) {
  if (inputs.discoverySummary.ruleVersion !== DISCOVERY_RULE_VERSION) throw new Error(`Expected ${DISCOVERY_RULE_VERSION}`);
  if (inputs.ledgerSummary.ledgerRuleVersion !== ERP_LEDGER_VERSION) throw new Error(`Expected ${ERP_LEDGER_VERSION}`);
  if (inputs.discoverySummary.dictionaryVersion !== 1522) throw new Error("Golden Set v1 requires dictionary version 1522");
  if (inputs.packages.length !== 400 || new Set(inputs.packages.map((row: InputRow) => row.document_id)).size !== 400) throw new Error("Expected 400 unique package documents");
  if (inputs.products.length !== 648 || inputs.links.length !== 648) throw new Error("Expected 648 product and ledger rows");
  if (inputs.packages.filter((row: InputRow) => Number(row.package_product_count) === 0).length !== 18) throw new Error("Expected all 18 no-product-evidence documents");
  const statuses = countBy(inputs.links, (row: InputRow) => row.identity_status);
  if (statuses.matched !== 99 || statuses.ambiguous !== 415 || statuses.unresolved !== 134) throw new Error(`ERP ledger status drift: ${JSON.stringify(statuses)}`);
  if (sha256File(inputs.files.products) !== inputs.ledgerSnapshot.productRowsSha256 || sha256File(inputs.files.packages) !== inputs.ledgerSnapshot.packageRowsSha256) throw new Error("Stage 2.1 input hash drift");
}

function validateSourceMetadata(inputs: GoldenInputs, source: SourceMetadataSnapshot) {
  if (source.documents.length !== 400 || new Set(source.documents.map((row) => row.document_id)).size !== 400) throw new Error("Source metadata must cover all 400 documents");
  const ids = new Set(inputs.packages.map((row) => row.document_id));
  if (source.documents.some((row) => !ids.has(row.document_id) || row.source_text_length < 0)) throw new Error("Source metadata document mismatch");
}

function candidates(row: InputRow, names: Map<string, { erp_product_name: string | null; prod_code: string | null }>): ErpCandidate[] {
  const raw = row.company && row.part_num ? [{ company: row.company, partNum: row.part_num, prodCode: row.prod_code, classId: row.class_id, hasBom: row.has_bom, orderNum: row.erp_order_num, orderLine: row.erp_order_line }, ...parseAlternatives(row.alternatives)] : parseAlternatives(row.alternatives);
  const seen = new Set<string>();
  return raw.filter((item) => item.company && item.partNum && !seen.has(`${item.company}:${item.partNum}`) && seen.add(`${item.company}:${item.partNum}`)).map((item) => {
    const meta = names.get(`${item.company}:${item.partNum}`);
    return {
      company: item.company, part_num: item.partNum, erp_product_name: meta?.erp_product_name ?? null,
      prod_code: item.prodCode || meta?.prod_code || null, class_id: item.classId || null,
      has_bom: item.hasBom === true || item.hasBom === "true" ? true : item.hasBom === false || item.hasBom === "false" ? false : null,
      erp_order_num: item.orderNum || null, erp_order_line: item.orderLine || null,
    };
  });
}

function parseAlternatives(value: string): any[] { try { return JSON.parse(value || "[]"); } catch { return []; } }
function itemKey(row: InputRow) { return `${row.document_id}:${row.package_item_order}`; }
function rowOrder(a: InputRow, b: InputRow) { return Number(a.document_id) - Number(b.document_id) || Number(a.package_item_order) - Number(b.package_item_order); }
function split(value: string) { return value.split("|").map((item) => item.trim()).filter(Boolean); }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function group(rows: InputRow[], key: string) { const result = new Map<string, InputRow[]>(); for (const row of rows) result.set(row[key], [...(result.get(row[key]) ?? []), row]); return result; }
function quantile(values: number[], value: number) { return values[Math.floor((values.length - 1) * value)] ?? 0; }
function lengthBucket(value: number, p10: number, p90: number) { return value <= p10 ? "short_outlier_p10" : value >= p90 ? "long_outlier_p90" : "typical_length"; }
function packageSize(row: InputRow) { const count = Number(row.package_product_count); return count === 0 ? "no_product_evidence" : count === 1 ? "single_item" : count <= 3 ? "multi_item_2_3" : "multi_item_4_plus"; }
function documentCohort(row: InputRow) { if (row.date_confidence === "low") return "undated_import_proxy"; return row.business_date < "2023-01-01" ? "legacy_pre_2023" : "current_2023_plus"; }
function identityProfile(rows: InputRow[]) { if (!rows.length) return "no_product_evidence"; const values = new Set(rows.map((row) => row.identity_status)); return values.size > 1 ? "mixed" : [...values][0]; }
function packageRisks(row: InputRow, links: InputRow[], meta: DocumentSourceMetadata, p10: number, p90: number) {
  return unique([
    ...(Number(row.package_product_count) === 0 ? ["all_no_product_evidence"] : []), ...(Number(row.package_product_count) > 1 ? ["multi_item_package"] : []),
    ...(row.held_component_evidence_pending_erp_identity ? ["held_component_evidence"] : []), ...(meta.has_accessory_signal ? ["attachment_or_accessory_signal"] : []),
    ...(meta.has_spare_signal ? ["spare_part_signal"] : []), ...(meta.has_component_signal ? ["component_signal"] : []),
    ...(meta.source_text_length <= p10 ? ["short_source_anomaly"] : meta.source_text_length >= p90 ? ["long_source_anomaly"] : []),
    ...links.flatMap(riskPatterns),
  ]);
}
function riskPatterns(row: InputRow) {
  const alternatives = parseAlternatives(row.alternatives);
  const codes = [row.prod_code, ...alternatives.map((item) => item.prodCode)].filter(Boolean).map((item) => String(item).toUpperCase());
  const normalizedName = row.product_name?.normalize("NFKC").toLowerCase().replace(/[\s_-]+/gu, "") ?? "";
  return unique([normalizedName.includes("gde70") && "GD-E70", codes.includes("0918") && "0918", codes.includes("091001") && "091001", codes.includes("P504") && "P504"].filter(Boolean) as string[]);
}
function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> { const result: Record<string, number> = {}; for (const row of rows) result[key(row)] = (result[key(row)] ?? 0) + 1; return result; }

export function sampleIndex(packages: PackagePacket[], erp: ErpPacket[]) {
  const rows = [...packages, ...erp].map((packet) => ({
    sample_id: packet.sample_id, layer: packet.layer, document_id: String(packet.source.document_id),
    package_item_order: packet.layer === "erp_identity" ? String(packet.source.package_item_order) : "",
    plan_status: String(packet.strata.plan_status), template_cohort: String(packet.strata.template_cohort),
    length_bucket: String(packet.strata.length_bucket), risk_patterns: (packet.strata.risk_patterns as string[]).join("|"),
    selection_reasons: packet.selection_reasons.join("|"), annotation_status: packet.annotation_status,
  }));
  const headers = Object.keys(rows[0]);
  return `${headers.join("\t")}\n${rows.map((row) => headers.map((header) => String((row as any)[header] ?? "").replace(/[\t\r\n]+/gu, " ")).join("\t")).join("\n")}\n`;
}
