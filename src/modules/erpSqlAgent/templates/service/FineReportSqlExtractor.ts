import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FineReportImportResult, SqlTemplateDatasetInput, SqlTemplateReportFileInput } from "../types/SqlTemplateTypes.js";

const DEFAULT_EXTENSIONS = [".cpt", ".frm"];
const TABLE_DATA_PATTERN = /<TableData\b([^>]*)>([\s\S]*?)<\/TableData>/giu;
const QUERY_PATTERN = /<Query\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Query>/iu;
const FORMULA_PATTERN = /<Formula\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Formula>/giu;
const DATABASE_PATTERN = /<DatabaseName\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/DatabaseName>/iu;
const NAME_PATTERN = /\bname="([^"]*)"/iu;
const FR_PARAM_PATTERN = /\$\{\s*([^}]+?)\s*\}/gu;

export type ImportFineReportOptions = {
  rootDir: string;
  dryRun?: boolean;
  extensions?: string[];
  onProgress?: (progress: { done: number; total: number; filePath: string }) => void;
};

export async function importFineReportSqlAssets(options: ImportFineReportOptions): Promise<FineReportImportResult> {
  const rootDir = path.resolve(options.rootDir);
  const extensions = (options.extensions?.length ? options.extensions : DEFAULT_EXTENSIONS).map((item) => item.toLowerCase());
  const result: FineReportImportResult = {
    rootDir,
    extensions,
    dryRun: options.dryRun === true,
    fileCount: 0,
    datasetCount: 0,
    errorCount: 0,
    errors: [],
    files: [],
  };

  const filePaths = await findReportFiles(rootDir, extensions);
  let done = 0;
  for (const filePath of filePaths) {
    try {
      const file = await parseReportFile(rootDir, filePath);
      result.files.push(file);
      result.fileCount += 1;
      result.datasetCount += file.datasets.length;
    } catch (error) {
      result.errorCount += 1;
      result.errors.push({ filePath, message: error instanceof Error ? error.message : String(error) });
    }
    done += 1;
    options.onProgress?.({ done, total: filePaths.length, filePath });
  }

  return result;
}

async function findReportFiles(rootDir: string, extensions: string[]): Promise<string[]> {
  const found: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(rootDir, entry.name);
    if (entry.isDirectory()) found.push(...await findReportFiles(child, extensions));
    if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) found.push(child);
  }
  return found.sort();
}

async function parseReportFile(rootDir: string, filePath: string): Promise<SqlTemplateReportFileInput> {
  const [buffer, stat] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
  const xml = buffer.toString("utf8");
  const datasets = extractDatasets(xml);
  return {
    filePath,
    relativePath: path.relative(rootDir, filePath),
    extension: path.extname(filePath).toLowerCase(),
    fileHash: sha256(buffer),
    fileSize: BigInt(stat.size),
    reportName: path.basename(filePath, path.extname(filePath)),
    datasets,
  };
}

export function extractDatasets(xml: string): SqlTemplateDatasetInput[] {
  const datasets: SqlTemplateDatasetInput[] = [];
  for (const match of xml.matchAll(TABLE_DATA_PATTERN)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const query = QUERY_PATTERN.exec(body)?.[1]?.trim();
    if (query) {
      datasets.push(makeDataset({
        datasetName: NAME_PATTERN.exec(attrs)?.[1],
        datasetType: "query",
        connectionName: DATABASE_PATTERN.exec(body)?.[1]?.trim(),
        sql: query,
      }));
    }
  }

  for (const match of xml.matchAll(FORMULA_PATTERN)) {
    const sql = match[1]?.trim();
    if (sql && /^\s*(select|with)\b/iu.test(sql)) {
      datasets.push(makeDataset({ datasetType: "formula_sql", sql }));
    }
  }

  return datasets;
}

function makeDataset(input: {
  datasetName?: string;
  datasetType: "query" | "formula_sql";
  connectionName?: string;
  sql: string;
}): SqlTemplateDatasetInput {
  return {
    datasetName: input.datasetName,
    datasetType: input.datasetType,
    connectionName: input.connectionName,
    rawSql: input.sql,
    sqlHash: sha256(input.sql),
    dynamicParams: extractFineReportParams(input.sql),
    riskFlags: riskFlags(input.sql),
  };
}

export function extractFineReportParams(sql: string): string[] {
  return [...new Set([...sql.matchAll(FR_PARAM_PATTERN)].map((match) => match[1]?.trim()).filter((item): item is string => Boolean(item)))];
}

function riskFlags(sql: string): string[] {
  const flags: string[] = [];
  if (FR_PARAM_PATTERN.test(sql)) flags.push("finereport_dynamic_param");
  if (/\b(insert|update|delete|merge|drop|truncate|alter|create|exec|execute)\b/iu.test(sql)) flags.push("non_select_keyword");
  if (/\+\s*\w+\s*\+/u.test(sql)) flags.push("string_concat_like");
  return flags;
}

function sha256(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
