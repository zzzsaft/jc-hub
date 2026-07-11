import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getErpSqlQueryClient } from "../../erpSqlAgent/query/index.js";
import { evaluateGoldenSet } from "../goldenSet/evaluator.js";
import { verifyEvaluationBaseline } from "../goldenSet/baseline.js";
import { buildGoldenSet, loadGoldenInputs, requiredErpProductKeys, sampleIndex, selectErpRows } from "../goldenSet/generator.js";
import {
  SOURCE_METADATA_SCHEMA_VERSION,
  sha256File,
  validatePackets,
  type DocumentSourceMetadata,
  type ErpPacket,
  type PackagePacket,
  type SourceMetadataSnapshot,
} from "../goldenSet/model.js";

type Options = {
  mode: "generate" | "evaluate" | "validate";
  discoveryDir: string;
  ledgerDir: string;
  outDir: string;
  packageFile?: string;
  erpFile?: string;
  manifestFile?: string;
  evaluationOut?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode !== "generate") return runExisting(options);
  loadEnvironment();
  const inputs = loadGoldenInputs(options.discoveryDir, options.ledgerDir);
  const sourcePath = path.join(options.outDir, "source-metadata.json");
  let source: SourceMetadataSnapshot;
  if (fs.existsSync(sourcePath)) {
    console.log("stage=source_metadata source=sealed_snapshot");
    source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  } else {
    console.log(`stage=document_metadata processed=0/${inputs.packages.length}`);
    const documents = await loadDocumentMetadata(inputs.packages.map((row) => row.document_id));
    console.log(`stage=document_metadata processed=${documents.length}/${inputs.packages.length}`);
    const selectedErp = selectErpRows(inputs);
    const keys = requiredErpProductKeys(selectedErp);
    console.log(`stage=erp_product_names processed=0/${keys.length}`);
    const erpProducts = await loadErpProductMetadata(keys, (processed) => console.log(`stage=erp_product_names processed=${processed}/${keys.length}`));
    source = {
      schema_version: SOURCE_METADATA_SCHEMA_VERSION, read_only: true,
      document_source: "production_config_agent.document_blocks", erp_source: "ERP Part plus latest OrderDtl description",
      documents, erp_products: erpProducts,
      safeguards: { database_writes: 0, erp_writes: 0, price_queries: 0, bom_detail_queries: 0, business_llm_calls: 0 },
    };
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(sourcePath, json(source));
  }
  const result = buildGoldenSet(inputs, source);
  assertNoAnnotationOverwrite(options.outDir);
  const packagePath = path.join(options.outDir, "product-package-annotation-packets.json");
  const erpPath = path.join(options.outDir, "erp-identity-annotation-packets.json");
  const manifestPath = path.join(options.outDir, "baseline-manifest.json");
  const files: Record<string, string> = {
    "annotation-schema.json": json(result.annotationSchema),
    "product-package-annotation-packets.json": json(result.packages),
    "erp-identity-annotation-packets.json": json(result.erp),
    "sample-index.tsv": sampleIndex(result.packages, result.erp),
    "baseline-manifest.json": json(result.manifest),
    "validation-report.json": json({ ...result.validation, source_metadata: sourceCoverage(source, result.erp) }),
  };
  for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(options.outDir, name), contents);
  const evaluation = evaluateGoldenSet(result.packages, result.erp, result.manifest);
  fs.writeFileSync(path.join(options.outDir, "baseline-evaluation.json"), json(evaluation));
  fs.writeFileSync(path.join(options.outDir, "report.md"), report(result.packages, result.erp, source, evaluation));
  const sealedFiles = [sourcePath, ...Object.keys(files).map((name) => path.join(options.outDir, name)), path.join(options.outDir, "baseline-evaluation.json"), path.join(options.outDir, "report.md")];
  fs.writeFileSync(path.join(options.outDir, "artifact-seal.json"), json({
    schema_version: "product-config-golden-artifact-seal-v1", immutable: true,
    artifacts: Object.fromEntries(sealedFiles.map((file) => [path.basename(file), { sha256: sha256File(file), bytes: fs.statSync(file).size }])),
    annotation_rule: "Never edit sealed packets in place. Copy them to annotator work files; gold is populated only after adjudication.",
  }));
  console.log(`stage=done package_packets=${result.packages.length} erp_packets=${result.erp.length} validation=${result.validation.passed ? "passed" : "failed"}`);
  console.log(JSON.stringify({ packagePath, erpPath, manifestPath, qualityStatus: evaluation.quality_status }, null, 2));
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    mode: "generate",
    discoveryDir: "tmp/product-config-new-product-type-review-400-v2",
    ledgerDir: "tmp/product-config-erp-identity-ledger-400-v1",
    outDir: "tmp/product-config-golden-set-v1",
  };
  for (const arg of args) {
    if (arg === "--apply") throw new Error("Golden Set v1 is read-only and rejects --apply");
    if (arg === "--evaluate") options.mode = "evaluate";
    else if (arg === "--validate") options.mode = "validate";
    else if (arg.startsWith("--discovery-dir=")) options.discoveryDir = arg.slice(16);
    else if (arg.startsWith("--ledger-dir=")) options.ledgerDir = arg.slice(13);
    else if (arg.startsWith("--out-dir=")) options.outDir = arg.slice(10);
    else if (arg.startsWith("--package-file=")) options.packageFile = arg.slice(15);
    else if (arg.startsWith("--erp-file=")) options.erpFile = arg.slice(11);
    else if (arg.startsWith("--manifest=")) options.manifestFile = arg.slice(11);
    else if (arg.startsWith("--evaluation-out=")) options.evaluationOut = arg.slice(17);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function runExisting(options: Options) {
  const packageFile = options.packageFile ?? path.join(options.outDir, "product-package-annotation-packets.json");
  const erpFile = options.erpFile ?? path.join(options.outDir, "erp-identity-annotation-packets.json");
  const packages = JSON.parse(fs.readFileSync(packageFile, "utf8")) as PackagePacket[];
  const erp = JSON.parse(fs.readFileSync(erpFile, "utf8")) as ErpPacket[];
  const manifestFile = options.manifestFile ?? path.join(options.outDir, "baseline-manifest.json");
  const baselineDir = path.dirname(manifestFile);
  const baseline = verifyEvaluationBaseline(baselineDir, packages, erp);
  if (options.mode === "validate") {
    const result = validatePackets(packages, erp, { package_packets: 160, erp_packets: 240, no_product_evidence: 18 });
    console.log(JSON.stringify({ ...result, baseline }, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const evaluation = { ...evaluateGoldenSet(packages, erp, manifest), baseline_validation: baseline };
  const output = options.evaluationOut ?? path.join(options.outDir, "evaluation.json");
  fs.writeFileSync(output, json(evaluation));
  console.log(JSON.stringify({ output, quality_status: evaluation.quality_status, annotation_coverage: evaluation.annotation_coverage, threshold_status: evaluation.threshold_results.status }, null, 2));
}

function loadEnvironment() {
  const envPath = process.env.DOTENV_CONFIG_PATH ?? "/Users/zzzsaft/Documents/jc-hub/.env";
  dotenv.config({ path: envPath });
}

async function loadDocumentMetadata(documentIds: string[]): Promise<DocumentSourceMetadata[]> {
  const primaryUrl = process.env.DATABASE_URL;
  if (!primaryUrl) throw new Error("DATABASE_URL is required for the read-only source metadata snapshot");
  try {
    return await queryDocumentMetadata(primaryUrl, documentIds);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const fallback = new URL(primaryUrl);
    fallback.hostname = "10.0.0.4";
    console.warn("stage=document_metadata primary_network_failed retry_host=10.0.0.4 read_only=true");
    return queryDocumentMetadata(fallback.toString(), documentIds);
  }
}

async function queryDocumentMetadata(databaseUrl: string, documentIds: string[]): Promise<DocumentSourceMetadata[]> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await prisma.documentBlock.findMany({
      where: { documentId: { in: documentIds.map(BigInt) } },
      select: { documentId: true, parserVersion: true, blocksJson: true },
      orderBy: { documentId: "asc" },
    });
    return rows.map((row) => {
      const blocks = object(row.blocksJson);
      const text = typeof blocks.llm_text === "string" ? blocks.llm_text : "";
      return {
        document_id: String(row.documentId), parser_version: row.parserVersion ?? "unknown",
        source_text_length: text.length, source_block_count: Array.isArray(blocks.blocks) ? blocks.blocks.length : 0,
        has_accessory_signal: /附件|配件/u.test(text), has_spare_signal: /备件|备用件/u.test(text),
        has_component_signal: /组件|支架|上模|下模|侧板|套件/u.test(text),
      };
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function loadErpProductMetadata(keys: Array<{ company: string; part_num: string }>, progress: (processed: number) => void) {
  const client = getErpSqlQueryClient();
  const rows: SourceMetadataSnapshot["erp_products"] = [];
  for (let offset = 0; offset < keys.length; offset += 80) {
    const chunk = keys.slice(offset, offset + 80);
    const filters = chunk.map((key) => `(p.Company = ${sqlText(key.company)} AND p.PartNum = ${sqlText(key.part_num)})`).join(" OR ");
    const result = await client.query({
      sql: `SELECT TOP 100 p.Company AS [company], p.PartNum AS [part_num],\n` +
        `COALESCE(NULLIF(latest.LineDesc, ''), p.PartDescription) AS [erp_product_name], p.ProdCode AS [prod_code]\n` +
        `FROM Erp.Part p\nOUTER APPLY (SELECT TOP 1 od.LineDesc FROM Erp.OrderDtl od WHERE od.Company = p.Company AND od.PartNum = p.PartNum ORDER BY od.OrderNum DESC, od.OrderLine DESC) latest\n` +
        `WHERE ${filters}\nORDER BY p.Company, p.PartNum`,
      maxRows: 100,
    });
    for (const row of result.rows) {
      const record = Object.fromEntries(result.fields.map((field, index) => [field, row[index]]));
      rows.push({ company: text(record.company), part_num: text(record.part_num), erp_product_name: nullableText(record.erp_product_name), prod_code: nullableText(record.prod_code) });
    }
    progress(Math.min(offset + chunk.length, keys.length));
  }
  return rows;
}

function assertNoAnnotationOverwrite(outDir: string) {
  for (const name of ["product-package-annotation-packets.json", "erp-identity-annotation-packets.json"]) {
    const file = path.join(outDir, name);
    if (!fs.existsSync(file)) continue;
    const packets = JSON.parse(fs.readFileSync(file, "utf8")) as Array<any>;
    if (packets.some((packet) => packet.gold || packet.annotation_status !== "pending" || Object.values(packet.annotations ?? {}).some(Boolean))) {
      throw new Error(`Refusing to overwrite annotated file: ${file}`);
    }
  }
}

function sourceCoverage(source: SourceMetadataSnapshot, erp: ErpPacket[]) {
  const keys = new Set(source.erp_products.map((row) => `${row.company}:${row.part_num}`));
  const candidates = erp.flatMap((packet) => packet.prediction.top_candidates);
  const named = candidates.filter((candidate) => candidate.erp_product_name).length;
  return {
    documents: source.documents.length, parser_versions: countBy(source.documents, (row) => row.parser_version),
    source_length: distribution(source.documents.map((row) => row.source_text_length)),
    signals: {
      accessory: source.documents.filter((row) => row.has_accessory_signal).length,
      spare: source.documents.filter((row) => row.has_spare_signal).length,
      component: source.documents.filter((row) => row.has_component_signal).length,
    },
    erp_candidate_names: { named, total: candidates.length, coverage: candidates.length ? named / candidates.length : null, snapshot_identity_keys: keys.size },
  };
}

function report(packages: PackagePacket[], erp: ErpPacket[], source: SourceMetadataSnapshot, evaluation: any) {
  const packageProducts = packages.reduce((sum, packet) => sum + packet.prediction.items.length, 0);
  const noEvidence = packages.filter((packet) => packet.prediction.evidence_sufficiency === "insufficient_evidence").length;
  const erpCounts = countBy(erp, (packet) => packet.prediction.identity_status);
  const sourceInfo = sourceCoverage(source, erp);
  return `# ProductConfigAgent Golden Set v1\n\n` +
    `固定输入为 product-package-discovery-v3.0、erp-identity-ledger-v1.1、dictionary 1522。产物已封存预测与空白 gold，当前没有人工真值。\n\n` +
    `## 已生成\n\n- product-package：${packages.length} 份、${packageProducts} 条预测 item；完整包含 ${noEvidence} 份 no-product-evidence 文档。\n` +
    `- ERP identity：${erp.length} 条；matched/ambiguous/unresolved = ${erpCounts.matched ?? 0}/${erpCounts.ambiguous ?? 0}/${erpCounts.unresolved ?? 0}。\n` +
    `- 源元数据：${source.documents.length} 份；长度 p10/p90 = ${sourceInfo.source_length.p10}/${sourceInfo.source_length.p90}；ERP候选名称覆盖 ${sourceInfo.erp_candidate_names.named}/${sourceInfo.erp_candidate_names.total}。\n` +
    `- 当前评测状态：${evaluation.quality_status}。预测分布不是 accuracy、precision 或 recall。\n\n` +
    `## 等待人工标注\n\n两个标注员应复制 sealed packets 独立填写 annotations；复核人处理分歧并仅在 adjudication 后写 gold。允许 insufficient_evidence、legitimate_ambiguity 和 abstain，不得为提高覆盖率强制建立 ERP 身份。\n\n` +
    `## 后续回填\n\nERP 身份提升线程完成后，只能更新待评测 prediction 副本或建立新 baseline；不得改写本 v1 seal。人工 adjudicated gold 保持独立。\n`;
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (value: number) => sorted[Math.floor((sorted.length - 1) * value)] ?? 0;
  return { min: sorted[0] ?? 0, p10: q(0.1), median: q(0.5), p90: q(0.9), max: sorted.at(-1) ?? 0 };
}

function json(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return String(value ?? "").trim(); }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function sqlText(value: string) { return `N'${value.replace(/'/g, "''")}'`; }
function isNetworkError(error: unknown) { return /Can't reach database server|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/u.test(error instanceof Error ? error.message : String(error)); }
function countBy<T>(rows: T[], key: (row: T) => string) { const result: Record<string, number> = {}; for (const row of rows) result[key(row)] = (result[key(row)] ?? 0) + 1; return result; }

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
