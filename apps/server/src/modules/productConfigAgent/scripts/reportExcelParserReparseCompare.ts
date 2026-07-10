import dotenv from "dotenv";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseExcelFile } from "../excelParser/index.js";

const DEFAULT_OUT_DIR = "tmp/product-config-excel-reparse-compare";
const CURRENT_PARSER_VERSION = "v2";

type CliOptions = {
  outDir: string;
  writeFiles: boolean;
  limit?: number;
  skip: number;
  documentIds: bigint[];
  batchSize: number;
};

type CompareRow = {
  documentId: string;
  parserVersion: string;
  fileExists: boolean;
  oldBlockCount: number;
  newBlockCount: number;
  oldLlmHash: string;
  newLlmHash: string;
  diffType: "same" | "whitespace_only" | "content_diff" | "structure_diff" | "parse_failed" | "missing_file" | "unsupported_file";
  recommendedAction: "keep_existing" | "reparse_blocks" | "manual_review" | "restore_file";
  riskReasons: string;
  errorCode: string;
  errorMessage: string;
};

type DocumentRow = {
  id: bigint;
  fileName: string | null;
  filePath: string;
  blocks: { parserVersion: string | null; blocksJson: unknown } | null;
};

let prismaForDisconnect: { $disconnect(): Promise<void> } | null = null;

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { outDir: DEFAULT_OUT_DIR, writeFiles: true, skip: 0, documentIds: [], batchSize: 100 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") throw new Error("read-only parser reparse compare rejects --apply");
    if (arg === "--no-files") {
      options.writeFiles = false;
      continue;
    }
    if (arg === "--out-dir" || arg === "--limit" || arg === "--skip" || arg === "--document-id" || arg === "--batch-size") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      assignOption(options, arg.slice(2), value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--out-dir=") || arg.startsWith("--limit=") || arg.startsWith("--skip=") || arg.startsWith("--document-id=") || arg.startsWith("--batch-size=")) {
      const [name, ...valueParts] = arg.slice(2).split("=");
      assignOption(options, name, valueParts.join("="));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export async function runExcelParserReparseCompareCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  loadEnv();
  const { prisma } = await import("../../../lib/prisma.js");
  prismaForDisconnect = prisma;
  const rows: CompareRow[] = [];
  let successCount = 0;
  let failedCount = 0;
  let recommendedReparseCount = 0;
  const total = await countDocuments(prisma, options);

  for (let offset = 0; offset < total; offset += options.batchSize) {
    const documents = await loadDocumentBatch(prisma, options, offset);
    console.log(`loaded ${Math.min(offset + documents.length, total)}/${total}`);
    for (const document of documents) {
      const row = await compareDocument(document);
      rows.push(row);
      if (row.errorCode) failedCount += 1;
      else successCount += 1;
      if (row.recommendedAction === "reparse_blocks") recommendedReparseCount += 1;
      if (rows.length % 25 === 0 || rows.length === total) {
        console.log(`progress ${rows.length}/${total} success=${successCount} failed=${failedCount} reparse=${recommendedReparseCount}`);
      }
    }
  }

  const summary = buildSummary(rows);
  if (options.writeFiles) {
    const outDir = path.resolve(options.outDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outDir, "summary.json"), `${json(summary)}\n`),
      writeFile(path.join(outDir, "parser-reparse-compare.tsv"), toTsv(rows)),
      writeFile(path.join(outDir, "reparse-candidates.tsv"), toTsv(rows.filter((row) => row.recommendedAction !== "keep_existing"))),
      writeFile(path.join(outDir, "report.md"), markdown(summary)),
    ]);
  }
  console.log(json(summary));
  return { summary, rows };
}

async function countDocuments(prisma: any, options: CliOptions): Promise<number> {
  if (options.documentIds.length) return options.documentIds.length;
  const count = await prisma.productDocument.count({ where: documentWhere(options) });
  return options.limit === undefined ? Math.max(0, count - options.skip) : Math.min(options.limit, Math.max(0, count - options.skip));
}

async function loadDocumentBatch(prisma: any, options: CliOptions, offset: number): Promise<DocumentRow[]> {
  const take = Math.min(options.batchSize, options.limit === undefined ? options.batchSize : options.limit - offset);
  if (take <= 0) return [];
  const skip = options.documentIds.length ? undefined : options.skip + offset;
  const where = documentWhere(options, offset, take);
  const documents = await prisma.productDocument.findMany({
    where,
    orderBy: { id: "asc" },
    skip,
    take: options.documentIds.length ? undefined : take,
    select: {
      id: true,
      fileName: true,
      filePath: true,
    },
  });
  return attachBlocks(prisma, documents);
}

function documentWhere(options: CliOptions, offset = 0, take = options.batchSize) {
  const documentIds = options.documentIds.length ? options.documentIds.slice(offset, offset + take) : [];
  const where = {
    ...(documentIds.length ? { id: { in: documentIds } } : {}),
    OR: [{ filePath: { endsWith: ".xlsx" } }, { filePath: { endsWith: ".xls" } }],
  };
  return where;
}

async function attachBlocks(prisma: any, documents: Array<{ id: bigint; fileName: string | null; filePath: string }>): Promise<DocumentRow[]> {
  const blocks = await prisma.documentBlock.findMany({
    where: { documentId: { in: documents.map((document: { id: bigint }) => document.id) } },
    select: { documentId: true, parserVersion: true, blocksJson: true },
  });
  const blocksByDocumentId = new Map(blocks.map((block: any) => [String(block.documentId), block]));
  return documents.map((document: any) => ({
    ...document,
    blocks: blocksByDocumentId.get(String(document.id)) ?? null,
  }));
}

async function compareDocument(document: DocumentRow): Promise<CompareRow> {
  const oldData = summarizeBlocks(document.blocks?.blocksJson);
  const riskReasons = new Set<string>();
  if (!document.blocks) riskReasons.add("missing_blocks");
  if ((document.blocks?.parserVersion ?? "") !== CURRENT_PARSER_VERSION) riskReasons.add("parser_version_not_v2");
  if (oldData.rowBlockCount > 0) riskReasons.add("old_blocks_include_rows");
  if (!fs.existsSync(document.filePath)) {
    return makeRow(document, oldData, {
      fileExists: false,
      diffType: "missing_file",
      recommendedAction: "restore_file",
      riskReasons,
      errorCode: "FILE_NOT_FOUND",
      errorMessage: "document file path is not readable from this host",
    });
  }
  const ext = path.extname(document.filePath).toLowerCase();
  if (ext !== ".xls" && ext !== ".xlsx") {
    return makeRow(document, oldData, {
      diffType: "unsupported_file",
      recommendedAction: "manual_review",
      riskReasons,
      errorCode: "UNSUPPORTED_EXCEL_FILE",
      errorMessage: "only .xls and .xlsx are compared",
    });
  }
  const parsed = await parseExcelFile({
    filePath: document.filePath,
    fileName: document.fileName ?? path.basename(document.filePath),
    sourceType: "local",
    options: { includeRowBlocks: false, buildLlmText: true },
  });
  if (!parsed.success) {
    riskReasons.add(parsed.error.code);
    return makeRow(document, oldData, {
      diffType: "parse_failed",
      recommendedAction: parsed.error.code === "SANITIZED_CONTENT_QUARANTINED" ? "manual_review" : "reparse_blocks",
      riskReasons,
      errorCode: parsed.error.code,
      errorMessage: parsed.error.message,
    });
  }
  const newData = summarizeBlocks(parsed.data);
  for (const reason of structureRiskReasons(newData)) riskReasons.add(reason);
  const diffType = classifyDiff(oldData, newData);
  const recommendedAction = recommendAction(diffType, riskReasons);
  return makeRow(document, oldData, {
    newData,
    diffType,
    recommendedAction,
    riskReasons,
  });
}

function summarizeBlocks(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, any> : {};
  const blocks = Array.isArray(record.blocks) ? record.blocks : [];
  const llmText = typeof record.llm_text === "string" ? record.llm_text : "";
  return {
    blockCount: blocks.length,
    rowBlockCount: blocks.filter((block) => block?.type === "row").length,
    hiddenCount: blocks.filter((block) => block?.source?.hidden === true).length,
    commentCount: blocks.filter((block) => typeof block?.comment_text === "string" && block.comment_text.trim()).length,
    textboxCount: blocks.filter((block) => block?.source?.kind === "textbox").length,
    llmText,
    llmHash: hash(llmText),
    llmCompactHash: hash(llmText.replace(/\s+/g, "")),
  };
}

function classifyDiff(oldData: ReturnType<typeof summarizeBlocks>, newData: ReturnType<typeof summarizeBlocks>): CompareRow["diffType"] {
  if (oldData.llmHash === newData.llmHash && oldData.blockCount === newData.blockCount) return "same";
  if (oldData.llmCompactHash === newData.llmCompactHash && oldData.blockCount === newData.blockCount) return "whitespace_only";
  if (oldData.blockCount !== newData.blockCount) return "structure_diff";
  return "content_diff";
}

function recommendAction(diffType: CompareRow["diffType"], riskReasons: Set<string>): CompareRow["recommendedAction"] {
  if (riskReasons.has("missing_blocks") || riskReasons.has("parser_version_not_v2") || riskReasons.has("old_blocks_include_rows")) return "reparse_blocks";
  if (diffType === "structure_diff" || diffType === "content_diff") return "reparse_blocks";
  if (riskReasons.has("has_hidden_content") || riskReasons.has("has_comments") || riskReasons.has("has_textboxes")) return "manual_review";
  return "keep_existing";
}

function structureRiskReasons(data: ReturnType<typeof summarizeBlocks>) {
  const reasons: string[] = [];
  if (data.hiddenCount > 0) reasons.push("has_hidden_content");
  if (data.commentCount > 0) reasons.push("has_comments");
  if (data.textboxCount > 0) reasons.push("has_textboxes");
  return reasons;
}

function makeRow(
  document: DocumentRow,
  oldData: ReturnType<typeof summarizeBlocks>,
  data: {
    newData?: ReturnType<typeof summarizeBlocks>;
    fileExists?: boolean;
    diffType: CompareRow["diffType"];
    recommendedAction: CompareRow["recommendedAction"];
    riskReasons: Set<string>;
    errorCode?: string;
    errorMessage?: string;
  },
): CompareRow {
  return {
    documentId: String(document.id),
    parserVersion: document.blocks?.parserVersion ?? "",
    fileExists: data.fileExists ?? true,
    oldBlockCount: oldData.blockCount,
    newBlockCount: data.newData?.blockCount ?? 0,
    oldLlmHash: oldData.llmHash,
    newLlmHash: data.newData?.llmHash ?? "",
    diffType: data.diffType,
    recommendedAction: data.recommendedAction,
    riskReasons: [...data.riskReasons].sort().join("|"),
    errorCode: data.errorCode ?? "",
    errorMessage: data.errorMessage ?? "",
  };
}

function buildSummary(rows: CompareRow[]) {
  return {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    successCount: rows.filter((row) => !row.errorCode).length,
    failedCount: rows.filter((row) => row.errorCode).length,
    diffTypeCounts: countBy(rows, (row) => row.diffType),
    recommendedActionCounts: countBy(rows, (row) => row.recommendedAction),
    riskReasonCounts: countReasons(rows),
    invariant: {
      successPlusFailedEqualsTotal: rows.filter((row) => !row.errorCode).length + rows.filter((row) => row.errorCode).length === rows.length,
    },
  };
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const result: Record<string, number> = {};
  for (const row of rows) result[key(row)] = (result[key(row)] ?? 0) + 1;
  return result;
}

function countReasons(rows: CompareRow[]) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    for (const reason of row.riskReasons.split("|").filter(Boolean)) {
      result[reason] = (result[reason] ?? 0) + 1;
    }
  }
  return result;
}

function assignOption(options: CliOptions, name: string, value: string) {
  if (name === "out-dir") {
    options.outDir = value;
    return;
  }
  if (name === "document-id") {
    options.documentIds.push(BigInt(value));
    return;
  }
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) throw new Error(`--${name} must be a non-negative integer`);
  if (name === "limit") options.limit = numberValue;
  else if (name === "skip") options.skip = numberValue;
  else if (name === "batch-size") options.batchSize = Math.max(1, numberValue);
  else throw new Error(`Unknown argument: --${name}`);
}

function toTsv(rows: readonly CompareRow[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${[headers.join("\t"), ...rows.map((row) => headers.map((header) => cell((row as any)[header])).join("\t"))].join("\n")}\n`;
}

function markdown(summary: ReturnType<typeof buildSummary>) {
  return [
    "# ProductConfigAgent Excel Parser Reparse Compare",
    "",
    `Generated at: ${summary.generatedAt}`,
    "",
    `Total: ${summary.total}`,
    `Success: ${summary.successCount}`,
    `Failed: ${summary.failedCount}`,
    "",
    table("Diff type", summary.diffTypeCounts),
    table("Recommended action", summary.recommendedActionCounts),
    table("Risk reason", summary.riskReasonCounts),
  ].join("\n");
}

function table(title: string, counts: Record<string, number>) {
  return [
    `## ${title}`,
    "",
    "| Key | Count |",
    "| --- | ---: |",
    ...Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `| ${key} | ${count} |`),
    "",
  ].join("\n");
}

function hash(value: string) {
  return value ? createHash("sha256").update(value).digest("hex") : "";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function loadEnv() {
  const envPath = process.env.DOTENV_CONFIG_PATH || path.resolve(".env");
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runExcelParserReparseCompareCli()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prismaForDisconnect?.$disconnect();
    });
}
