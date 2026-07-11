import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import XLSX from "xlsx";
import { buildLlmText, sanitizeExcelText } from "./text.js";
import { ExcelParserError, type ExcelParseResult, type ExcelParserOptions } from "./types.js";
import { parseWorkbook } from "./workbook.js";

export { ExcelParserError } from "./types.js";
export type { BuildLlmTextOptions, CellBlock, ExcelBlock, ExcelParseResult, ExcelParserOptions, ParsedOption, RowBlock, TextboxBlock } from "./types.js";
export { buildLlmText, makeLlmFriendlyText, normalizeOptionMarksInline, sanitizeExcelText } from "./text.js";
export { parseOptionsFromText } from "./options.js";
export { parseWorkbook } from "./workbook.js";

const execFileAsync = promisify(execFile);

const defaultExcelParserOptions: Required<ExcelParserOptions> = {
  parseTextboxes: true,
  keepTempFile: false,
  includeRowBlocks: false,
  xlsMode: "direct-first",
  buildLlmText: true,
  llmTextOptions: {},
};

export async function parseExcelFile(params: {
  filePath: string;
  sourceType?: "local" | "url";
  fileName?: string;
  options?: ExcelParserOptions;
  tempDir?: string;
}): Promise<ExcelParseResult> {
  const options = { ...defaultExcelParserOptions, ...(params.options ?? {}) };
  const tempDir = params.tempDir ?? (await fsPromises.mkdtemp(path.join(os.tmpdir(), "product-config-excel-")));
  try {
    if (!fs.existsSync(params.filePath)) {
      throw new ExcelParserError("FILE_NOT_FOUND", "Excel 文件不存在");
    }
    const ext = path.extname(params.filePath).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      throw new ExcelParserError("UNSUPPORTED_EXCEL_FILE", "仅支持 .xls 或 .xlsx 文件");
    }

    // For legacy .xls files, resolveParseWorkbook reads the direct input once and
    // returns that workbook for parsing.  This avoids a second read that can make
    // direct-first results depend on a file changing underneath the parser.
    const { parsePath, workbook } = await resolveParseWorkbook(params.filePath, tempDir, options);
    const blocks = await parseWorkbook(workbook, {
      filePath: parsePath,
      includeRowBlocks: options.includeRowBlocks,
      parseTextboxes: options.parseTextboxes,
    });
    const data: Extract<ExcelParseResult, { success: true }>["data"] = {
      file_name: sanitizeExcelText(params.fileName ?? path.basename(params.filePath)).trim(),
      source_type: params.sourceType ?? "local",
      blocks,
    };
    if (options.buildLlmText) {
      data.llm_text = buildLlmText(data, options.llmTextOptions);
    }
    return { success: true, data };
  } catch (error) {
    if (error instanceof ExcelParserError) {
      return { success: false, error: { code: error.code, message: error.message } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: "EXCEL_PARSE_FAILED", message } };
  } finally {
    if (!options.keepTempFile && !params.tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function resolveParseWorkbook(
  filePath: string,
  tempDir: string,
  options: Required<ExcelParserOptions>,
): Promise<{ parsePath: string; workbook: XLSX.WorkBook }> {
  const readWorkbook = (parsePath: string) => XLSX.readFile(parsePath, { cellDates: true });
  if (path.extname(filePath).toLowerCase() !== ".xls") {
    return { parsePath: filePath, workbook: readWorkbook(filePath) };
  }
  if (options.xlsMode === "direct") {
    return { parsePath: filePath, workbook: readWorkbook(filePath) };
  }
  if (options.xlsMode === "convert") {
    const parsePath = await convertXlsToXlsx(filePath, tempDir);
    return { parsePath, workbook: readWorkbook(parsePath) };
  }
  try {
    return { parsePath: filePath, workbook: readWorkbook(filePath) };
  } catch (directError) {
    try {
      const parsePath = await convertXlsToXlsx(filePath, tempDir);
      return { parsePath, workbook: readWorkbook(parsePath) };
    } catch (convertError) {
      // Do not flatten this to EXCEL_PARSE_FAILED: callers need to distinguish a
      // broken/unavailable conversion tool from a workbook parse failure.
      if (convertError instanceof ExcelParserError) throw convertError;
      throw new ExcelParserError(
        "XLS_CONVERT_FAILED",
        `无法读取 .xls，且 LibreOffice 转换失败（direct: ${errorMessage(directError)}；convert: ${errorMessage(convertError)}）`,
      );
    }
  }
}

async function convertXlsToXlsx(filePath: string, tempDir: string) {
  await fsPromises.mkdir(tempDir, { recursive: true });
  // A caller may deliberately share tempDir between files.  Isolating each
  // conversion prevents basename collisions and makes filenames with spaces or
  // repeated names harmless.
  const outputDir = await fsPromises.mkdtemp(path.join(tempDir, "xls-convert-"));
  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "xlsx",
      "--outdir",
      outputDir,
      filePath,
    ]);
  } catch (error) {
    throw new ExcelParserError(
      "XLS_CONVERT_FAILED",
      `LibreOffice .xls 转换失败（command: soffice --headless --convert-to xlsx）: ${errorMessage(error)}`,
    );
  }
  const converted = await findConvertedXlsx(outputDir);
  if (!converted) {
    throw new ExcelParserError("XLS_CONVERT_FAILED", `LibreOffice 未生成 xlsx 文件（输出目录: ${outputDir}）`);
  }
  return converted;
}

/** Exported for focused tests; conversion itself remains private to this module. */
export async function findConvertedXlsx(outputDir: string): Promise<string | null> {
  const entries = await fsPromises.readdir(outputDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".xlsx")
    .map((entry) => path.join(outputDir, entry.name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const stats = await Promise.all(candidates.map(async (candidate) => ({ candidate, stat: await fsPromises.stat(candidate) })));
  stats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || left.candidate.localeCompare(right.candidate));
  return stats[0].candidate;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` [${error.code}]` : "";
    return `${error.message}${code}`;
  }
  return String(error);
}
