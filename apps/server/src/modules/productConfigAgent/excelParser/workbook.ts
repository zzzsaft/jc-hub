import path from "node:path";
import XLSX from "xlsx";
import { ExcelParserError, type CellBlock, type ExcelBlock, type RowBlock } from "./types.js";
import { parseOptionsFromText } from "./options.js";
import { makeLlmFriendlyText, sanitizeExcelText } from "./text.js";
import { parseTextboxes } from "./textboxXml.js";

export async function parseWorkbook(
  workbook: XLSX.WorkBook,
  options?: { filePath?: string; includeRowBlocks?: boolean; parseTextboxes?: boolean },
): Promise<ExcelBlock[]> {
  if (!workbook.SheetNames?.length) {
    throw new ExcelParserError("EMPTY_WORKBOOK", "Excel 工作簿为空");
  }
  const blocks: ExcelBlock[] = [];
  let nonEmptyRawCellCount = 0;
  let sanitizedDroppedCellCount = 0;
  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRange = sheet?.["!ref"] ?? null;
    if (!sheet || !sheetRange) continue;
    const sheetCellBlocks: CellBlock[] = [];
    for (const { address: cellAddress, rowIndex, colIndex } of sortedCellAddresses(sheet)) {
      const cell = sheet[cellAddress];
      if (!cell) continue;
      const { text: rawText, rawNonEmpty, sanitizedDropped } = cellText(cell);
      if (rawNonEmpty) nonEmptyRawCellCount += 1;
      if (sanitizedDropped) sanitizedDroppedCellCount += 1;
      if (!rawText.trim()) continue;
      const block = makeCellBlock({
        sheetName,
        sheetRange,
        cellAddress,
        rowIndex,
        colIndex,
        rawText,
        commentText: commentText(cell),
        mergeRange: mergeRangeForCell(sheet["!merges"], rowIndex, colIndex),
        hidden: isHidden(workbook, sheetIndex, sheet, rowIndex, colIndex),
      });
      sheetCellBlocks.push(block);
      blocks.push(block);
    }
    if (options?.includeRowBlocks && sheetCellBlocks.length > 0) {
      blocks.push(...makeRowBlocks(sheetName, sheetCellBlocks));
    }
  }
  if (options?.parseTextboxes !== false && options?.filePath && path.extname(options.filePath).toLowerCase() === ".xlsx") {
    blocks.push(...parseTextboxes(options.filePath));
  }
  if (sanitizedDroppedCellCount >= 10 && sanitizedDroppedCellCount * 2 >= nonEmptyRawCellCount) {
    throw new ExcelParserError(
      "SANITIZED_CONTENT_QUARANTINED",
      `Excel 文本存在异常控制字符，已丢弃 ${sanitizedDroppedCellCount}/${nonEmptyRawCellCount} 个非空单元格`,
    );
  }
  if (!blocks.length) {
    throw new ExcelParserError("EMPTY_EXCEL_CONTENT", "Excel 未解析到有效文本内容");
  }
  return blocks;
}

function sortedCellAddresses(sheet: XLSX.WorkSheet) {
  return Object.keys(sheet)
    .filter((address) => /^[A-Z]+[0-9]+$/i.test(address))
    .map((address) => {
      const decoded = XLSX.utils.decode_cell(address);
      return { address, rowIndex: decoded.r, colIndex: decoded.c };
    })
    .sort((left, right) => left.rowIndex - right.rowIndex || left.colIndex - right.colIndex);
}

function makeCellBlock(params: {
  sheetName: string;
  sheetRange: string | null;
  cellAddress: string;
  rowIndex: number;
  colIndex: number;
  rawText: string;
  commentText: string | null;
  mergeRange: string | null;
  hidden: boolean;
}): CellBlock {
  const optionResult = parseOptionsFromText(params.rawText);
  const blockId = `${safeSheetNameForId(params.sheetName)}_${params.cellAddress}`;
  return {
    block_id: blockId,
    id: blockId,
    type: "cell",
    text: optionResult.hasOptions ? optionResult.normalizedText : makeLlmFriendlyText(params.rawText),
    raw_text: params.rawText,
    ...(params.commentText ? { comment_text: params.commentText } : {}),
    options: optionResult.options,
    source: {
      sheet_name: sanitizeExcelText(params.sheetName).trim(),
      kind: "cell",
      cell: params.cellAddress,
      row: params.rowIndex + 1,
      col: params.colIndex + 1,
      sheet_range: params.sheetRange,
      merge_range: params.mergeRange,
      hidden: params.hidden,
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
    const blockId = `row:${safeSheetNameForId(sheetName)}:${row}`;
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
        hidden: orderedBlocks.every((block) => block.source.hidden === true),
      },
    };
  });
}

function cellText(cell: XLSX.CellObject) {
  const formatted = XLSX.utils.format_cell(cell);
  const rawText = String(formatted || cell.w || cell.v || "").trim();
  const text = sanitizeExcelText(rawText).trim();
  return { text, rawNonEmpty: Boolean(rawText), sanitizedDropped: Boolean(rawText && !text) };
}

function commentText(cell: XLSX.CellObject) {
  const value = (cell as XLSX.CellObject & { c?: Array<{ t?: unknown }> }).c
    ?.map((comment) => sanitizeExcelText(comment.t).trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return value || null;
}

function isHidden(workbook: XLSX.WorkBook, sheetIndex: number, sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number) {
  const sheetHidden = Boolean((workbook.Workbook?.Sheets?.[sheetIndex] as { Hidden?: number } | undefined)?.Hidden);
  return sheetHidden || Boolean(sheet["!rows"]?.[rowIndex]?.hidden) || Boolean(sheet["!cols"]?.[colIndex]?.hidden);
}

function mergeRangeForCell(merges: XLSX.Range[] | undefined, rowIndex: number, colIndex: number) {
  const merge = merges?.find((item) => rowIndex >= item.s.r && rowIndex <= item.e.r && colIndex >= item.s.c && colIndex <= item.e.c);
  return merge ? XLSX.utils.encode_range(merge) : null;
}

function safeSheetNameForId(sheetName: string) {
  return sanitizeExcelText(sheetName).trim().replace(/[^\w\u4e00-\u9fa5]+/g, "_") || "Sheet";
}
