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
