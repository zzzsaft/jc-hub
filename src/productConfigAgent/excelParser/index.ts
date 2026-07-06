import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import XLSX from "xlsx";

const execFileAsync = promisify(execFile);

const SELECTED_MARKS = "■☑☒●◉▣◆√✓✔";
const UNSELECTED_MARKS = "□☐○◯◻◇▢";
const selectedMarkRegExp = new RegExp(`[${SELECTED_MARKS}]`, "g");
const unselectedMarkRegExp = new RegExp(`[${UNSELECTED_MARKS}]`, "g");
const UNSAFE_CONTROL_CHARS = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const C1_CONTROL_CHARS = /[\u0080-\u009f]/;

export class ExcelParserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExcelParserError";
  }
}

export type ParsedOption = {
  selected: boolean;
  label: string;
  value: string;
  normalized: string;
};

export type CellBlock = {
  block_id: string;
  id: string;
  type: "cell";
  text: string;
  raw_text: string;
  options: ParsedOption[];
  source: {
    sheet_name: string;
    kind: "cell";
    cell: string;
    row: number;
    col: number;
    sheet_range: string | null;
    merge_range: string | null;
  };
};

export type RowBlock = {
  block_id: string;
  id: string;
  type: "row";
  text: string;
  content: {
    text: string;
    cells: Array<{
      source: string;
      text: string;
      raw_text: string;
      options: ParsedOption[];
    }>;
  };
  source: {
    sheet_name: string;
    kind: "row";
    range: string;
    cells: string[];
  };
};

export type TextboxBlock = {
  block_id: string;
  id: string;
  type: "paragraph";
  text: string;
  raw_text: string;
  options: ParsedOption[];
  source: {
    sheet_name: string;
    kind: "textbox";
    drawing: string;
    anchor: {
      from: string | null;
      to: string | null;
    };
  };
};

export type ExcelBlock = CellBlock | RowBlock | TextboxBlock;

export type BuildLlmTextOptions = {
  mode?: "row" | "cell";
  includeInstruction?: boolean;
  includeFileMeta?: boolean;
  includeSheetName?: boolean;
  includeEmptyCells?: boolean;
  includeMergeContext?: boolean;
  skipHeaderLikeRows?: boolean;
};

export type ExcelParserOptions = {
  parseTextboxes?: boolean;
  keepTempFile?: boolean;
  includeRowBlocks?: boolean;
  xlsMode?: "direct-first" | "direct" | "convert";
  buildLlmText?: boolean;
  llmTextOptions?: BuildLlmTextOptions;
};

export type ExcelParseResult =
  | {
      success: true;
      data: {
        file_name: string;
        source_type: "local" | "url";
        blocks: ExcelBlock[];
        llm_text?: string;
      };
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };

const defaultExcelParserOptions: Required<ExcelParserOptions> = {
  parseTextboxes: true,
  keepTempFile: false,
  includeRowBlocks: false,
  xlsMode: "direct-first",
  buildLlmText: true,
  llmTextOptions: {},
};

const defaultBuildLlmTextOptions: Required<BuildLlmTextOptions> = {
  mode: "row",
  includeInstruction: true,
  includeFileMeta: true,
  includeSheetName: true,
  includeEmptyCells: false,
  includeMergeContext: true,
  skipHeaderLikeRows: true,
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

export async function parseWorkbook(
  workbook: XLSX.WorkBook,
  options?: { filePath?: string; includeRowBlocks?: boolean; parseTextboxes?: boolean },
): Promise<ExcelBlock[]> {
  if (!workbook.SheetNames?.length) {
    throw new ExcelParserError("EMPTY_WORKBOOK", "Excel 工作簿为空");
  }
  const blocks: ExcelBlock[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRange = sheet?.["!ref"] ?? null;
    if (!sheet || !sheetRange) continue;
    const range = XLSX.utils.decode_range(sheetRange);
    const sheetCellBlocks: CellBlock[] = [];
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        const cell = sheet[cellAddress];
        if (!cell) continue;
        const rawText = cellText(cell);
        if (!rawText.trim()) continue;
        const block = makeCellBlock({
          sheetName,
          sheetRange,
          cellAddress,
          rowIndex,
          colIndex,
          rawText,
          mergeRange: mergeRangeForCell(sheet["!merges"], rowIndex, colIndex),
        });
        sheetCellBlocks.push(block);
        blocks.push(block);
      }
    }
    if (options?.includeRowBlocks && sheetCellBlocks.length > 0) {
      blocks.push(...makeRowBlocks(sheetName, sheetCellBlocks));
    }
  }
  if (options?.parseTextboxes !== false && options?.filePath && path.extname(options.filePath).toLowerCase() === ".xlsx") {
    blocks.push(...parseTextboxes(options.filePath));
  }
  if (!blocks.length) {
    throw new ExcelParserError("EMPTY_EXCEL_CONTENT", "Excel 未解析到有效文本内容");
  }
  return blocks;
}

function makeCellBlock(params: {
  sheetName: string;
  sheetRange: string | null;
  cellAddress: string;
  rowIndex: number;
  colIndex: number;
  rawText: string;
  mergeRange: string | null;
}): CellBlock {
  const optionResult = parseOptionsFromText(params.rawText);
  const blockId = `${safeSheetNameForId(params.sheetName)}_${params.cellAddress}`;
  return {
    block_id: blockId,
    id: blockId,
    type: "cell",
    text: optionResult.hasOptions ? optionResult.normalizedText : makeLlmFriendlyText(params.rawText),
    raw_text: params.rawText,
    options: optionResult.options,
    source: {
      sheet_name: sanitizeExcelText(params.sheetName).trim(),
      kind: "cell",
      cell: params.cellAddress,
      row: params.rowIndex + 1,
      col: params.colIndex + 1,
      sheet_range: params.sheetRange,
      merge_range: params.mergeRange,
    },
  };
}

function makeRowBlocks(sheetName: string, cellBlocks: CellBlock[]): RowBlock[] {
  const byRow = new Map<number, CellBlock[]>();
  for (const block of cellBlocks) {
    byRow.set(block.source.row, [...(byRow.get(block.source.row) ?? []), block]);
  }
  return [...byRow.entries()].map(([row, blocks]) => {
    const orderedBlocks = blocks.sort((left, right) => left.source.col - right.source.col);
    const cells = orderedBlocks.map((block) => block.source.cell);
    const blockId = `${safeSheetNameForId(sheetName)}_R${row}`;
    const text = orderedBlocks.map((block) => block.text).join("\n");
    return {
      block_id: blockId,
      id: blockId,
      type: "row",
      text,
      content: {
        text,
        cells: orderedBlocks.map((block) => ({
          source: block.source.cell,
          text: block.text,
          raw_text: block.raw_text,
          options: block.options,
        })),
      },
      source: {
        sheet_name: sanitizeExcelText(sheetName).trim(),
        kind: "row",
        range: cells.length === 1 ? cells[0] : `${cells[0]}:${cells[cells.length - 1]}`,
        cells,
      },
    };
  });
}

export function buildLlmText(
  parsedResult: { file_name?: string; source_type?: string; blocks?: ExcelBlock[] } | { data?: { file_name?: string; source_type?: string; blocks?: ExcelBlock[] } },
  options?: BuildLlmTextOptions,
): string {
  const data = ("data" in parsedResult && parsedResult.data ? parsedResult.data : parsedResult) as {
    file_name?: string;
    source_type?: string;
    blocks?: ExcelBlock[];
  };
  const config = { ...defaultBuildLlmTextOptions, ...(options ?? {}) };
  const lines: string[] = [];
  if (config.includeFileMeta) {
    lines.push(`文件名：${data.file_name ?? ""}`);
    lines.push(`来源：${data.source_type ?? ""}`);
    lines.push("");
  }
  if (config.includeInstruction) {
    lines.push("说明：");
    lines.push("[SEL] 表示该选项被选中。");
    lines.push("[ ] 表示该选项未选中。");
    lines.push("若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。");
    lines.push("[ ] 仅为未选中备选项，不输出为最终值。");
    lines.push("空括号表示未填写。");
    lines.push("文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。");
    lines.push("");
  }
  const blocks = data.blocks ?? [];
  const cellsBySheet = groupCellsBySheet(blocks, config.includeEmptyCells);
  for (const [sheetName, cells] of cellsBySheet.entries()) {
    if (config.mode === "cell") pushCellMode(lines, sheetName, cells, config);
    else pushRowMode(lines, sheetName, cells, config);
  }
  const textboxes = blocks.filter(isTextboxBlock);
  if (textboxes.length) {
    lines.push("Textboxes：");
    for (const block of textboxes) {
      lines.push(`[${block.block_id}] ${block.text}`);
      const optionSet = buildOptionSetLine(block);
      if (optionSet) lines.push(optionSet);
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pushRowMode(lines: string[], sheetName: string, cells: CellBlock[], config: Required<BuildLlmTextOptions>) {
  if (config.includeSheetName) {
    lines.push(`Sheet：${sheetName}`);
    lines.push("");
  }
  const rows = new Map<number, CellBlock[]>();
  const mergeContextByRow = config.includeMergeContext ? buildMergeContextByRow(cells) : new Map<number, string>();
  for (const cell of cells) rows.set(cell.source.row, [...(rows.get(cell.source.row) ?? []), cell]);
  for (const [row, rowCells] of [...rows.entries()].sort(([left], [right]) => left - right)) {
    const orderedCells = rowCells.sort((left, right) => left.source.col - right.source.col);
    if (config.skipHeaderLikeRows && shouldSkipHeaderLikeRow(orderedCells)) continue;
    lines.push(`Row ${row}:`);
    const hasAColumnText = orderedCells.some((cell) => cell.source.col === 1 && cell.text.trim());
    const mergeContext = mergeContextByRow.get(row);
    if (mergeContext && !hasAColumnText) lines.push(`上下文：${mergeContext}`);
    for (const cell of orderedCells) {
      pushCell(lines, cell);
      const optionSet = buildOptionSetLine(cell);
      if (optionSet) lines.push(optionSet);
    }
    lines.push("");
  }
}

function pushCellMode(lines: string[], sheetName: string, cells: CellBlock[], config: Required<BuildLlmTextOptions>) {
  if (config.includeSheetName) {
    lines.push(`Sheet：${sheetName}`);
    lines.push("");
  }
  const sortedCells = cells.sort((left, right) => left.source.row - right.source.row || left.source.col - right.source.col);
  for (const cell of sortedCells) {
    if (config.skipHeaderLikeRows) {
      const rowCells = sortedCells.filter((item) => item.source.row === cell.source.row);
      if (shouldSkipHeaderLikeRow(rowCells)) continue;
    }
    pushCell(lines, cell);
    const optionSet = buildOptionSetLine(cell);
    if (optionSet) lines.push(optionSet);
  }
  lines.push("");
}

function pushCell(lines: string[], cell: CellBlock) {
  const coordinate = `[${cell.source.cell}]`;
  if (cell.text.includes("\n")) {
    lines.push(coordinate);
    lines.push(cell.text);
  } else {
    lines.push(`${coordinate} ${cell.text}`);
  }
}

function buildOptionSetLine(block: CellBlock | TextboxBlock) {
  if (!block.options.length) return null;
  const options = block.options.map((option) => ({ selected: option.selected, value: option.value })).filter((option) => option.value);
  if (!options.length) return null;
  const payload: { options: Array<{ selected: boolean; value: string }>; field?: string } = { options };
  const field = inferFieldName(block.text || block.raw_text);
  if (field) payload.field = field;
  return `option_set: ${JSON.stringify(payload)}`;
}

function groupCellsBySheet(blocks: ExcelBlock[], includeEmptyCells: boolean) {
  const sheets = new Map<string, CellBlock[]>();
  blocks.filter(isCellBlock).filter((block) => includeEmptyCells || Boolean(block.text.trim())).forEach((block) => {
    const sheetName = block.source.sheet_name || "UNKNOWN_SHEET";
    sheets.set(sheetName, [...(sheets.get(sheetName) ?? []), block]);
  });
  return sheets;
}

function buildMergeContextByRow(cells: CellBlock[]) {
  const contextByRow = new Map<number, string>();
  for (const cell of cells) {
    if (cell.source.col !== 1 || !cell.source.merge_range || !cell.text.trim()) continue;
    let range: XLSX.Range;
    try {
      range = XLSX.utils.decode_range(cell.source.merge_range);
    } catch {
      continue;
    }
    if (range.s.c !== 0 || range.e.c !== 0 || range.e.r <= range.s.r) continue;
    for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
      contextByRow.set(row, cell.text.trim());
    }
  }
  return contextByRow;
}

function shouldSkipHeaderLikeRow(cells: CellBlock[]) {
  const text = cells.map((cell) => cell.text).join("\n").trim();
  if (!text) return true;
  if (cells.some((cell) => cell.options.length || /\[(SEL| )\]/.test(cell.text))) return false;
  if (/[：:]/.test(text)) return false;
  const compactText = text.replace(/\s+/g, "");
  const hasHeaderMarker = /生产明细表|内部使用|注意保密/.test(compactText) || /^QR\d+(?:[.-]\d+)*/i.test(compactText);
  if (!hasHeaderMarker) return false;
  return !["模头编号", "客户ID", "合同编号", "下单日期", "适用塑料原料", "制品有效", "模头有效", "模唇调节", "电镀", "进料口", "连接器"].some((hint) =>
    compactText.includes(hint),
  );
}

function isCellBlock(block: ExcelBlock): block is CellBlock {
  return block.type === "cell" && block.source.kind === "cell";
}

function isTextboxBlock(block: ExcelBlock): block is TextboxBlock {
  return block.type === "paragraph" && block.source.kind === "textbox";
}

function cellText(cell: XLSX.CellObject) {
  const formatted = XLSX.utils.format_cell(cell);
  return sanitizeExcelText(formatted || cell.w || cell.v).trim();
}

function mergeRangeForCell(merges: XLSX.Range[] | undefined, rowIndex: number, colIndex: number) {
  const merge = merges?.find((item) => rowIndex >= item.s.r && rowIndex <= item.e.r && colIndex >= item.s.c && colIndex <= item.e.c);
  return merge ? XLSX.utils.encode_range(merge) : null;
}

function safeSheetNameForId(sheetName: string) {
  return sanitizeExcelText(sheetName).trim().replace(/[^\w\u4e00-\u9fa5]+/g, "_") || "Sheet";
}

export function sanitizeExcelText(input: unknown): string {
  if (input === undefined || input === null) return "";
  const text = String(input);
  const unsafeControlMatches = text.match(UNSAFE_CONTROL_CHARS);
  if (C1_CONTROL_CHARS.test(text) || (unsafeControlMatches?.length ?? 0) >= 2) return "";
  return text.replace(/\u0000/g, "").replace(UNSAFE_CONTROL_CHARS, "");
}

export function normalizeOptionMarksInline(text: string) {
  if (!text) return "";
  return String(text)
    .replace(new RegExp(`[\\[\\(（]\\s*([${SELECTED_MARKS}])\\s*[\\]\\)）]`, "g"), "[SEL]")
    .replace(new RegExp(`[\\[\\(（]\\s*([${UNSELECTED_MARKS}])\\s*[\\]\\)）]`, "g"), "[ ]")
    .replace(selectedMarkRegExp, "[SEL]")
    .replace(unselectedMarkRegExp, "[ ]");
}

export function makeLlmFriendlyText(text: string) {
  if (!text) return "";
  const normalized = normalizeOptionMarksInline(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\[(SEL| )\]\s*/g, (token) => `${token.trim()} `)
    .replace(/[ \t]+(?=\[(?:SEL| )\])/g, "\n")
    .replace(/([^\n])(\[(?:SEL| )\])/g, "$1\n$2");
  return replaceWhitespaceRunsOutsideBrackets(normalized, "\n")
    .replace(/([^\n\s])[ \t]{2,}([^\s：:]{1,18}[：:])/g, "$1\n$2")
    .replace(/[ \t\u3000]*\n[ \t\u3000]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseOptionsFromText(text: string): { hasOptions: boolean; options: ParsedOption[]; normalizedText: string } {
  const normalizedInline = normalizeOptionMarksInline(text);
  const options: ParsedOption[] = [];
  const matches = Array.from(normalizedInline.matchAll(/\[(SEL| )\]/g));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const token = match[0];
    const segmentStart = (match.index ?? 0) + token.length;
    const segmentEnd = nextMatch?.index ?? normalizedInline.length;
    const label = extractOptionLabel(normalizedInline.slice(segmentStart, segmentEnd));
    if (!label) continue;
    const selected = token === "[SEL]";
    options.push({ selected, label, value: label, normalized: `${selected ? "[SEL]" : "[ ]"} ${label}` });
  }
  return { hasOptions: options.length > 0, options, normalizedText: makeLlmFriendlyText(text) };
}

function extractOptionLabel(segment: string) {
  const withoutPrefix = segment.replace(/^[\s:：,，;；、\-]+/, "");
  const lineBreakStop = withoutPrefix.search(/\r?\n/);
  const lineText = lineBreakStop >= 0 ? withoutPrefix.slice(0, lineBreakStop) : withoutPrefix;
  return trimOptionLabel(removeTrailingNextOptionContext(lineText));
}

function trimOptionLabel(label: string) {
  return label.replace(/^[\s:：,，;；、\-]+/, "").replace(/[\s,，;；、]+$/, "").trim();
}

function removeTrailingNextOptionContext(label: string) {
  const whitespaceRunRegExp = /[ \t\u3000]{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = whitespaceRunRegExp.exec(label))) {
    if (isInsideBrackets(label, match.index)) continue;
    const head = label.slice(0, match.index);
    const tail = label.slice(match.index + match[0].length);
    if (trimOptionLabel(head) && looksLikeNextOptionContext(tail)) return head;
  }
  return label;
}

function looksLikeNextOptionContext(text: string) {
  const compact = trimOptionLabel(text).replace(/\s+/g, "");
  return Boolean(compact && compact.length <= 16 && !/[：:；;，,、]/.test(compact) && /^[\u4e00-\u9fa5A-Za-z0-9（）()]+$/.test(compact));
}

function isInsideBrackets(text: string, index: number) {
  const before = text.slice(0, index);
  const lastOpen = Math.max(before.lastIndexOf("（"), before.lastIndexOf("("));
  const lastClose = Math.max(before.lastIndexOf("）"), before.lastIndexOf(")"));
  return lastOpen > lastClose;
}

function replaceWhitespaceRunsOutsideBrackets(text: string, replacement: string) {
  let result = "";
  let index = 0;
  let bracketDepth = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "（" || char === "(") {
      bracketDepth += 1;
      result += char;
      index += 1;
      continue;
    }
    if (char === "）" || char === ")") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      result += char;
      index += 1;
      continue;
    }
    if (bracketDepth === 0 && /[ \t]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[ \t]/.test(text[end])) end += 1;
      const run = text.slice(index, end);
      const next = text[end];
      result += run.length >= 2 && next && !/\s/.test(next) ? replacement : run;
      index = end;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

function inferFieldName(rawText: string) {
  const firstToken = rawText.search(/\[(SEL| )\]/g);
  const withoutOptionTokens = firstToken >= 0 ? rawText.slice(0, firstToken) : rawText;
  const rawField = withoutOptionTokens
    .split(/\r?\n/g)[0]
    .split(/[:：]/)[0]
    .replace(/^\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/^[-_—–\s:：,，;；、]+/, "")
    .replace(/[\s:：,，;；、]+$/, "")
    .trim();
  if (!rawField || rawField.length > 36 || /\[(?:SEL| )\]/.test(rawField)) return null;
  return rawField;
}

function parseTextboxes(filePath: string): TextboxBlock[] {
  const blocks: TextboxBlock[] = [];
  try {
    const zip = new AdmZip(filePath);
    const drawingEntries = zip
      .getEntries()
      .filter((entry: { isDirectory: boolean; entryName: string }) => !entry.isDirectory && /^xl\/drawings\/drawing\d+\.xml$/i.test(entry.entryName));
    let textboxIndex = 1;
    for (const entry of drawingEntries) {
      const xml = entry.getData().toString("utf8");
      const shapeXmls = collectShapeXmls(xml);
      for (const shapeXml of shapeXmls) {
        const rawText = sanitizeExcelText(
          [...shapeXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>|<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((match) => decodeXml(match[1] ?? match[2] ?? ""))
            .join(""),
        ).trim();
        if (!rawText) continue;
        const optionResult = parseOptionsFromText(rawText);
        const blockId = `textbox_${textboxIndex++}`;
        blocks.push({
          block_id: blockId,
          id: blockId,
          type: "paragraph",
          text: optionResult.normalizedText,
          raw_text: rawText,
          options: optionResult.options,
          source: {
            sheet_name: "UNKNOWN_NEED_REL_MAPPING",
            kind: "textbox",
            drawing: entry.entryName,
            anchor: parseAnchor(shapeXml),
          },
        });
      }
    }
  } catch (error) {
    console.warn("Parse xlsx textboxes failed:", error instanceof Error ? error.message : String(error));
  }
  return blocks;
}

function collectShapeXmls(xml: string) {
  const matches = [...xml.matchAll(/<xdr:sp\b[\s\S]*?<\/xdr:sp>|<sp\b[\s\S]*?<\/sp>/g)].map((match) => match[0]);
  return matches.filter((item) => /(?:xdr:txBody|txBody|<a:t|<t)/.test(item));
}

function parseAnchor(xml: string) {
  return {
    from: anchorPointToCell(xml.match(/<(?:xdr:)?from\b[\s\S]*?<\/(?:xdr:)?from>/)?.[0] ?? ""),
    to: anchorPointToCell(xml.match(/<(?:xdr:)?to\b[\s\S]*?<\/(?:xdr:)?to>/)?.[0] ?? ""),
  };
}

function anchorPointToCell(xml: string) {
  const col = Number(xml.match(/<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>/)?.[1]);
  const row = Number(xml.match(/<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/)?.[1]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return XLSX.utils.encode_cell({ r: row, c: col });
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
