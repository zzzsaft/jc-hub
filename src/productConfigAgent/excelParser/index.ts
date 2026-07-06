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

    const parsePath = await resolveParsePath(params.filePath, tempDir, options);
    const workbook = XLSX.readFile(parsePath, { cellDates: true });
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

async function resolveParsePath(filePath: string, tempDir: string, options: Required<ExcelParserOptions>) {
  if (path.extname(filePath).toLowerCase() !== ".xls") return filePath;
  if (options.xlsMode === "direct") return filePath;
  if (options.xlsMode === "convert") return convertXlsToXlsx(filePath, tempDir);
  try {
    XLSX.readFile(filePath, { cellDates: true });
    return filePath;
  } catch {
    return convertXlsToXlsx(filePath, tempDir);
  }
}

async function convertXlsToXlsx(filePath: string, tempDir: string) {
  await fsPromises.mkdir(tempDir, { recursive: true });
  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "xlsx",
      "--outdir",
      tempDir,
      filePath,
    ]);
  } catch (error) {
    throw new ExcelParserError(
      "XLS_CONVERT_FAILED",
      `LibreOffice .xls 转换失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const converted = path.join(tempDir, `${path.basename(filePath, path.extname(filePath))}.xlsx`);
  if (!fs.existsSync(converted)) {
    throw new ExcelParserError("XLS_CONVERT_FAILED", "LibreOffice 未生成 xlsx 文件");
  }
  return converted;
}
