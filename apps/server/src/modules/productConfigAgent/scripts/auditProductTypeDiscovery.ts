import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  PRODUCT_TYPE_DISCOVERY_RULE_VERSION,
  PRODUCT_TYPE_DISCOVERY_SEED,
  decideDocumentPrimaryProduct,
  safeProductText,
  selectDiscoverySamples,
  selectTechnicalQuestionSamples,
  type DiscoveryDetail,
  type DiscoveryMetadata,
  type DocumentProductDecision,
} from "../productType/discovery.js";
import {
  classifyProductItemRole,
  resolveProductType,
  type ProductTypeDefinition,
} from "../productType/resolver.js";
import { classifyDieConfiguration } from "../productType/dieConfiguration.js";
import { erpProductGroupReference, expectedErpProductGroups } from "../productType/erpTaxonomy.js";

const prisma = new PrismaClient();

type MetadataRow = {
  document_id: bigint;
  created_at: Date;
  has_plan: boolean;
  archive_order_date: Date | null;
  archive_doc_info: unknown;
  block_date_match: string[] | null;
};

type DetailRow = {
  document_id: bigint;
  file_name: string | null;
  blocks_json: unknown;
  llm_plan_json: unknown;
  extraction_json: unknown;
  normalized_extraction_json: unknown;
};

type AliasEvidenceRow = { document_id: bigint; item_name: string };

function parseArgs() {
  const result = {
    outDir: "tmp/product-config-new-product-type-review-400-v2",
    asOf: new Date().toISOString().slice(0, 10),
    expectedDictionaryVersion: undefined as number | undefined,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--apply") throw new Error("read-only product type discovery rejects --apply");
    if (arg.startsWith("--out-dir=")) result.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--as-of=")) result.asOf = arg.slice("--as-of=".length);
    else if (arg.startsWith("--expected-dictionary-version=")) result.expectedDictionaryVersion = Number(arg.slice("--expected-dictionary-version=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.asOf)) throw new Error("--as-of must be YYYY-MM-DD");
  if (result.expectedDictionaryVersion !== undefined && !Number.isInteger(result.expectedDictionaryVersion)) throw new Error("expected dictionary version must be an integer");
  return result;
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

function tsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const cell = (value: unknown) => String(value ?? "").replace(/[\t\r\n]+/g, " ");
  return [columns.join("\t"), ...rows.map((row) => columns.map((column) => cell(row[column])).join("\t"))].join("\n") + "\n";
}

async function loadMetadata(): Promise<DiscoveryMetadata[]> {
  const rows = await prisma.$queryRaw<MetadataRow[]>(Prisma.sql`
    select d.id as document_id, d.created_at,
           exists (
             select 1 from production_config_agent.extraction_results p
              where p.document_id = d.id and p.llm_plan_json is not null
           ) as has_plan,
           archive.order_date as archive_order_date,
           archive.doc_info_json as archive_doc_info,
           regexp_match(
             coalesce(b.blocks_json->>'llm_text', ''),
             '(订单日期|下单日期|制单日期|签订日期|合同日期|日期)[^0-9]{0,12}((?:19|20)[0-9]{2}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2})',
             'i'
           ) as block_date_match
      from production_config_agent.documents d
      join production_config_agent.document_blocks b on b.document_id = d.id
      left join lateral (
        select order_date, doc_info_json
          from production_config_agent.contract_archives ca
         where ca.document_id = d.id
         order by ca.updated_at desc, ca.id desc
         limit 1
      ) archive on true
     order by d.id
  `);
  return rows.map((row) => ({
    documentId: row.document_id,
    createdAt: row.created_at,
    hasPlan: row.has_plan,
    archiveOrderDate: row.archive_order_date,
    archiveDocInfo: row.archive_doc_info,
    blockDateLabel: row.block_date_match?.[0] ?? null,
    blockDateValue: row.block_date_match?.[1] ?? null,
  }));
}

async function loadDetails(ids: bigint[]): Promise<DiscoveryDetail[]> {
  const rows = await prisma.$queryRaw<DetailRow[]>(Prisma.sql`
    select d.id as document_id, d.file_name, b.blocks_json,
           extraction.llm_plan_json, extraction.extraction_json, extraction.normalized_extraction_json
      from production_config_agent.documents d
      join production_config_agent.document_blocks b on b.document_id = d.id
      left join lateral (
        select llm_plan_json, extraction_json, normalized_extraction_json
          from production_config_agent.extraction_results er
         where er.document_id = d.id
         order by er.created_at desc, er.id desc
         limit 1
      ) extraction on true
     where d.id in (${Prisma.join(ids)})
  `);
  return rows.map((row) => ({
    documentId: row.document_id,
    fileName: row.file_name,
    blocksJson: row.blocks_json,
    planJson: row.llm_plan_json,
    extractionJson: row.extraction_json,
    normalizedExtractionJson: row.normalized_extraction_json,
  }));
}

async function loadDictionary() {
  const [terms, aliases, version] = await Promise.all([
    prisma.dictionaryTerm.findMany({ where: { termType: "product_type", isActive: true }, orderBy: { canonicalValue: "asc" } }),
    prisma.dictionaryAlias.findMany({ where: { termType: "product_type", isActive: true }, orderBy: { aliasValue: "asc" } }),
    prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } }),
  ]);
  const aliasesByTerm = new Map<string, string[]>();
  for (const alias of aliases) aliasesByTerm.set(String(alias.termId), [...(aliasesByTerm.get(String(alias.termId)) ?? []), alias.aliasValue]);
  const definitions: ProductTypeDefinition[] = terms.map((term) => ({
    canonicalValue: term.canonicalValue,
    displayName: term.displayName,
    aliases: aliasesByTerm.get(String(term.id)) ?? [],
  }));
  return { terms, aliases, definitions, version: Number(version?.versionValue ?? 0) };
}

async function loadAliasRiskEvidence(): Promise<AliasEvidenceRow[]> {
  return prisma.$queryRaw<AliasEvidenceRow[]>(Prisma.sql`
    with latest as (
      select distinct on (document_id) document_id, llm_plan_json
        from production_config_agent.extraction_results
       where llm_plan_json is not null
       order by document_id, created_at desc, id desc
    )
    select document_id, btrim(item->>'item_name') as item_name
      from latest
      cross join lateral jsonb_array_elements(coalesce(llm_plan_json->'items', '[]'::jsonb)) item
     where btrim(coalesce(item->>'item_name', '')) ~ '(吸风罩|换网器支架|熔喷模头|模头)'
  `);
}

function candidateRows(decisions: DocumentProductDecision[]) {
  const groups = new Map<string, Array<{ decision: DocumentProductDecision; product: DocumentProductDecision["packageItems"][number] }>>();
  for (const decision of decisions) {
    for (const product of decision.packageItems.filter((item) => item.newProductTypeCandidate)) {
      groups.set(product.candidateKey, [...(groups.get(product.candidateKey) ?? []), { decision, product }]);
    }
  }
  return [...groups.entries()].map(([key, rows]) => ({
    candidate_key: key,
    display_name_sample: rows[0].product.productName,
    document_count: new Set(rows.map((row) => String(row.decision.documentId))).size,
    document_samples: [...new Set(rows.map((row) => String(row.decision.documentId)))].slice(0, 12).join(","),
    evidence_sources: [...new Set(rows.flatMap((row) => row.product.evidenceSources.split("|")).filter(Boolean))].sort().join("|"),
    status: "technical_question",
    note: "开放式产品项候选，等待业务规则或ERP产品身份，不直接创建 canonical",
  })).sort((left, right) => right.document_count - left.document_count || left.candidate_key.localeCompare(right.candidate_key, "zh-CN"));
}

function aliasRiskRows(params: {
  decisions: DocumentProductDecision[];
  definitions: ProductTypeDefinition[];
  historicalEvidence: AliasEvidenceRow[];
}) {
  const risks = [
    { alias: "吸风罩", owner: "vacuum_box", pattern: /吸风罩/, recommendation: "deactivate_alias_pending_approval", reason: "普查规则将其视为罩体组件；且流延膜吸风罩仍与 air_knife 语义冲突" },
    { alias: "换网器支架", owner: "filter", pattern: /换网器支架/, recommendation: "deactivate_alias_pending_approval", reason: "中心名词为支架，默认应保留 component/item_role" },
    { alias: "PP医用熔喷模头", owner: "spinneret_plate", pattern: /医用.*熔喷|熔喷.*医用/, recommendation: "manual_structure_review", reason: "模头与喷丝板组件边界需要配置结构证据，不能仅靠名称合并" },
    { alias: "模头", owner: "flat_die", pattern: /模头/, recommendation: "keep_exact_generic_only_pending_approval", reason: "只能作为最低优先级泛化兜底，具体吹膜/涂布/熔喷必须先匹配" },
  ];
  return risks.map((risk) => {
    const sampleObservations = params.decisions.flatMap((decision) => decision.observations.map((item) => ({ documentId: decision.documentId, raw: item.raw, role: item.role }))).filter((item) => risk.pattern.test(item.raw));
    const historicalObservations = params.historicalEvidence.map((row) => {
      const raw = safeProductText(row.item_name);
      const resolution = resolveProductType(raw, params.definitions);
      return { documentId: row.document_id, raw, role: classifyProductItemRole(raw, resolution) };
    }).filter((item) => item.raw && risk.pattern.test(item.raw));
    const deduped = new Map<string, typeof sampleObservations[number]>();
    for (const item of [...sampleObservations, ...historicalObservations]) deduped.set(`${item.documentId}:${item.raw}`, item);
    const observations = [...deduped.values()];
    const roles = Object.fromEntries(["main_product", "system", "component", "accessory", "spare_part"].map((role) => [role, observations.filter((item) => item.role === role).length]));
    const definition = params.definitions.find((item) => item.canonicalValue === risk.owner);
    return {
      alias_value: risk.alias,
      current_owner: risk.owner,
      current_owner_active: Boolean(definition),
      observation_count: observations.length,
      document_count: new Set(observations.map((item) => String(item.documentId))).size,
      role_counts: JSON.stringify(roles),
      evidence_samples: [...new Set(observations.map((item) => item.raw))].slice(0, 8).join(" | "),
      recommendation: risk.recommendation,
      reason: risk.reason,
      approval_required: true,
    };
  });
}

function ensureSafeOutput(output: string, name: string) {
  if (/客户|联系人|联系电话|手机号|电话号码|地址|有限公司|股份有限公司|公司名称|文件名/u.test(output)) {
    throw new Error(`sensitive output rejected: ${name}`);
  }
}

async function main() {
  const args = parseArgs();
  const outDir = path.resolve(args.outDir);
  const previousSummary = fs.existsSync(path.join(outDir, "summary.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "summary.json"), "utf8")) : null;
  const [metadata, dictionary, historicalAliasEvidence] = await Promise.all([loadMetadata(), loadDictionary(), loadAliasRiskEvidence()]);
  if (args.expectedDictionaryVersion !== undefined && dictionary.version !== args.expectedDictionaryVersion) {
    throw new Error(`dictionary version drift: expected ${args.expectedDictionaryVersion}, got ${dictionary.version}`);
  }
  const selected = selectDiscoverySamples(metadata, args.asOf);
  const details = await loadDetails(selected.samples.map((sample) => sample.documentId));
  const detailById = new Map(details.map((detail) => [String(detail.documentId), detail]));
  const decisions = selected.samples.map((sample) => {
    const detail = detailById.get(String(sample.documentId));
    const decision = detail ? decideDocumentPrimaryProduct(detail, dictionary.definitions) : {
      ...classifyDieConfiguration(null, ""),
      documentId: sample.documentId, primaryName: "", productFamily: "", itemRole: "unresolved" as const,
      resolutionMethod: "", evidenceSources: "", secondaryProducts: "", rejectedComponents: "", ruleConfidence: 0,
      conflictEvidence: "", newProductTypeCandidate: false, unresolvedReason: "missing_document_blocks", packageItems: [], observations: [],
    };
    return { ...decision, hasPlan: sample.hasPlan, sample };
  });
  const candidates = candidateRows(decisions);
  const aliasRisks = aliasRiskRows({ decisions, definitions: dictionary.definitions, historicalEvidence: historicalAliasEvidence });
  const questionSamples = selectTechnicalQuestionSamples(decisions, 100);
  const productRows = decisions.flatMap(({ sample, packageItems, documentId }) => packageItems.map((product, index) => ({
    document_id: documentId,
    package_item_order: index + 1,
    business_date: sample.businessDate.value,
    has_plan: sample.hasPlan,
    product_name: product.productName,
    product_type: product.productFamily,
    product_display_name: product.productDisplayName,
    item_role_compatibility: product.itemRole,
    resolution_method: product.resolutionMethod,
    evidence_sources: product.evidenceSources,
    rule_confidence_not_accuracy: product.ruleConfidence,
    die_product_family: product.dieProductFamily,
    finished_form: product.finishedForm,
    application: product.application,
    configuration_family: product.configurationFamily,
    product_thickness_min_mm: product.productThicknessMinMm,
    product_thickness_max_mm: product.productThicknessMaxMm,
    restrictor_configured: product.restrictorConfigured,
    configuration_evidence: product.configurationEvidence,
    configuration_question: product.configurationConflict,
    expected_erp_prod_codes: expectedErpProductGroups(product.productFamily).join("|"),
    erp_identity_status: "product_number_not_linked_in_discovery",
    new_product_type_candidate: product.newProductTypeCandidate,
  })));
  const documentRows = decisions.map(({ sample, observations: _observations, hasPlan, ...decision }) => ({
    document_id: decision.documentId,
    business_date: sample.businessDate.value,
    date_source: sample.businessDate.source,
    date_confidence: sample.businessDate.confidence,
    date_rejection: sample.businessDate.rejectedReason,
    has_plan: hasPlan,
    sample_class: sample.sampleClass,
    package_product_count: decision.packageItems.length,
    package_product_types: decision.packageItems.map((item) => item.productFamily || item.productName).join(" | "),
    package_product_names: decision.packageItems.map((item) => item.productName).join(" | "),
    representative_item_name_compatibility_only: decision.primaryName,
    held_component_evidence_pending_erp_identity: decision.rejectedComponents,
    cooccurring_product_evidence: decision.conflictEvidence,
    unresolved_reason: decision.unresolvedReason,
  }));
  const questionRows = questionSamples.map(({ sample, observations: _observations, ...decision }) => ({
      document_id: decision.documentId,
      has_plan: decision.hasPlan,
      sample_class: sample.sampleClass,
      package_product_count: decision.packageItems.length,
      package_product_names: decision.packageItems.map((item) => item.productName).join(" | "),
      package_product_types: decision.packageItems.map((item) => item.productFamily || item.productName).join(" | "),
      question_codes: [
        decision.unresolvedReason,
        decision.packageItems.length > 1 && "multi_product_package",
        decision.packageItems.some((item) => item.resolutionMethod === "generic_fallback") && "generic_product_type",
        decision.packageItems.some((item) => item.newProductTypeCandidate) && "new_product_type",
        ...decision.packageItems.map((item) => item.configurationConflict),
      ].filter(Boolean).join("|"),
      held_component_evidence_pending_erp_identity: decision.rejectedComponents,
      required_answer: "提供产品规则或ERP产品编号/订单行证据；不要求逐行人工标注",
    }));
  const classCounts = Object.fromEntries([...new Set(selected.samples.map((sample) => sample.sampleClass))].sort().map((key) => [key, selected.samples.filter((sample) => sample.sampleClass === key).length]));
  const snapshotHash = crypto.createHash("sha256").update(JSON.stringify({
    ids: selected.samples.map((sample) => String(sample.documentId)),
    dictionary: dictionary.definitions,
    seed: PRODUCT_TYPE_DISCOVERY_SEED,
    asOf: args.asOf,
  })).digest("hex");
  const summary = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    asOf: args.asOf,
    ruleVersion: PRODUCT_TYPE_DISCOVERY_RULE_VERSION,
    seed: PRODUCT_TYPE_DISCOVERY_SEED,
    dictionaryVersion: dictionary.version,
    previousDictionaryVersion: previousSummary?.dictionaryVersion ?? null,
    dictionaryVersionChangedSincePreviousRun: previousSummary ? previousSummary.dictionaryVersion !== dictionary.version : null,
    inputSnapshotSha256: snapshotHash,
    counts: {
      populationDocumentsWithBlocks: metadata.length,
      documents: decisions.length,
      uniqueDocuments: new Set(decisions.map((item) => String(item.documentId))).size,
      withoutPlan: decisions.filter((item) => !item.hasPlan).length,
      withPlan: decisions.filter((item) => item.hasPlan).length,
      documentsWithProductEvidence: decisions.filter((item) => item.packageItems.length > 0).length,
      documentsWithoutProductEvidence: decisions.filter((item) => item.packageItems.length === 0).length,
      packageProductRows: productRows.length,
      multiProductPackages: decisions.filter((item) => item.packageItems.length > 1).length,
      heldComponentEvidence: decisions.reduce((sum, item) => sum + item.observations.filter((observation) => !["main_product", "system"].includes(observation.role)).length, 0),
      futureBusinessDatesRejected: selected.samples.filter((sample) => sample.businessDate.rejectedReason.includes("future_")).length,
      futureDatesUsedAsRecent: selected.samples.filter((sample) => sample.businessDate.explicit && sample.businessDate.value > args.asOf).length,
      newCandidateClusters: candidates.length,
      technicalQuestionRows: questionSamples.length,
      flatDieProducts: productRows.filter((item) => item.die_product_family === "flat_die").length,
      coatingDieProducts: productRows.filter((item) => item.die_product_family === "coating_die").length,
      roundDieProducts: productRows.filter((item) => item.die_product_family === "round_die").length,
      boardFinishedFormProducts: productRows.filter((item) => item.finished_form === "board").length,
      sheetFinishedFormProducts: productRows.filter((item) => item.finished_form === "sheet").length,
      boardSheetFinishedFormProducts: productRows.filter((item) => item.finished_form === "board_sheet").length,
      filmFinishedFormProducts: productRows.filter((item) => item.finished_form === "film").length,
      erpProductGroupHintedProducts: productRows.filter((item) => item.expected_erp_prod_codes).length,
      configurationQuestions: productRows.filter((item) => item.configuration_question).length,
    },
    sampleClasses: classCounts,
    quotaShortfalls: selected.shortfalls,
    quality: {
      manualRowLabelingRequired: false,
      accuracyAvailable: false,
      note: "technical-question-samples-100.tsv is a rule and ERP identity question pool, not a manual row-labeling task; acceptance uses product-package coverage and later ERP identity consistency",
    },
    safeguards: { databaseWrites: 0, refreshJobs: 0, normalizationRuns: 0, workersStarted: 0, businessLlmCalls: 0 },
  };
  const approvalPackage = {
    mode: "dry-run",
    dictionaryVersion: dictionary.version,
    inputSnapshotSha256: snapshotHash,
    executableActions: [],
    blockedActions: aliasRisks.map((row) => ({
      action: row.recommendation,
      termType: "product_type",
      aliasValue: row.alias_value,
      currentOwner: row.current_owner,
      reason: row.reason,
      requiresExplicitUserApproval: true,
    })),
    validation: { passed: true, errors: [] },
    writesPerformed: 0,
  };
  const erpReferenceRows = erpProductGroupReference().map((row) => ({
    ...row,
    evidence: "ERP Agent read-only verification 2026-07-10",
    usage: "family hint only; exact PartNum/order line required before BOM or price lookup",
  }));
  const files: Record<string, string> = {
    "document-product-packages.tsv": tsv(documentRows, Object.keys(documentRows[0])),
    "document-products.tsv": tsv(productRows, Object.keys(productRows[0])),
    "document-primary-products.tsv": tsv(documentRows, Object.keys(documentRows[0])),
    "new-product-type-candidates.tsv": tsv(candidates, ["candidate_key", "display_name_sample", "document_count", "document_samples", "evidence_sources", "status", "note"]),
    "alias-risk-audit.tsv": tsv(aliasRisks, ["alias_value", "current_owner", "current_owner_active", "observation_count", "document_count", "role_counts", "evidence_samples", "recommendation", "reason", "approval_required"]),
    "technical-question-samples-100.tsv": tsv(questionRows, Object.keys(questionRows[0])),
    "golden-review-100.tsv": tsv(questionRows, Object.keys(questionRows[0])),
    "erp-product-group-reference.tsv": tsv(erpReferenceRows, Object.keys(erpReferenceRows[0])),
    "summary.json": JSON.stringify(plain(summary), null, 2) + "\n",
    "approval-package.json": JSON.stringify(plain(approvalPackage), null, 2) + "\n",
    "report.md": `# 阶段 2.1：报价产品包与产品类型普查\n\n` +
      `本次按 ${args.asOf} 固定时间截面、规则 ${PRODUCT_TYPE_DISCOVERY_RULE_VERSION}、字典版本 ${dictionary.version} 只读重跑。文档表示报价产品包，包内产品平级并可独立销售，不强制选择主产品。\n\n` +
      `## 结果\n\n- 400 份守恒：${summary.counts.uniqueDocuments}；无 plan ${summary.counts.withoutPlan}。\n` +
      `- 有产品证据 ${summary.counts.documentsWithProductEvidence} 份；无产品证据 ${summary.counts.documentsWithoutProductEvidence} 份；共输出 ${summary.counts.packageProductRows} 条产品族记录；多产品报价包 ${summary.counts.multiProductPackages} 份。\n` +
      `- 名称像组件的证据保留 ${summary.counts.heldComponentEvidence} 条，等待 ERP PartNum/订单行确认是否为独立可售产品，不永久拒绝。\n` +
      `- 拒绝未来业务日期 ${summary.counts.futureBusinessDatesRejected} 份；仍作为 recent 的未来日期 ${summary.counts.futureDatesUsedAsRecent}。\n` +
      `- 开放式新 family 候选簇 ${summary.counts.newCandidateClusters}；全部进入技术规则/ERP身份问题池，不直接创建 canonical。\n\n` +
      `## 模头与成品形态\n\n模头产品族只分平模、涂布模头、吹膜圆模；膜/板/片是独立成品形态。文档未明确板或片的平模暂归 board_sheet，不用厚度强行覆盖名称。热成型厚度和阻流棒只作为配置/价格结构证据。\n\n` +
      `## 技术问题池与 ERP\n\ntechnical-question-samples-100.tsv 用于归纳规则和补 ERP 产品身份，不要求逐行人工标注。ERP 产品群组只作为 family hint；必须关联具体 PartNum 或订单行后才能查询独立 BOM 和价格。\n\n` +
      `## 字典风险\n\n吸风罩、换网器支架、PP医用熔喷模头、模头四组只生成 alias-risk-audit.tsv 和 approval-package.json。所有动作均 blocked，等待明确审批；本次未写数据库、未 refresh、未 normalization、未启动 worker/job、未调用业务 LLM。\n`,
  };
  if (decisions.length !== 400 || summary.counts.uniqueDocuments !== 400) throw new Error("400 unique document conservation failed");
  if (summary.counts.withoutPlan < 280) throw new Error("at least 280 samples must have no plan");
  if (summary.counts.futureDatesUsedAsRecent !== 0) throw new Error("future business date entered recent sample");
  const dieMisroutes = decisions.flatMap((item) => item.packageItems).filter((item) => item.productFamily === "flat_die" && /吹膜|涂布|涂覆/u.test(item.productName));
  if (dieMisroutes.length) {
    throw new Error(`specific die family fell through to flat_die: ${dieMisroutes.slice(0, 10).map((item) => safeProductText(item.productName)).join(" | ")}`);
  }
  if (questionSamples.length !== 100) throw new Error("technical question sample must contain 100 rows");
  for (const [name, output] of Object.entries(files)) ensureSafeOutput(output, name);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, output] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), output);
  console.log(JSON.stringify(plain(summary), null, 2));
}

main().finally(() => prisma.$disconnect());
