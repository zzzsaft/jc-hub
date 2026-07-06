import XLSX from "xlsx";
import type { BuildLlmTextOptions, CellBlock, ExcelBlock, TextboxBlock } from "./types.js";

const SELECTED_MARKS = "■☑☒●◉▣◆√✓✔";
const UNSELECTED_MARKS = "□☐○◯◻◇▢";
const selectedMarkRegExp = new RegExp(`[${SELECTED_MARKS}]`, "g");
const unselectedMarkRegExp = new RegExp(`[${UNSELECTED_MARKS}]`, "g");
const UNSAFE_CONTROL_CHARS = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const C1_CONTROL_CHARS = /[\u0080-\u009f]/;

const defaultBuildLlmTextOptions: Required<BuildLlmTextOptions> = {
  mode: "row",
  includeInstruction: true,
  includeFileMeta: true,
  includeSheetName: true,
  includeEmptyCells: false,
  includeMergeContext: true,
  skipHeaderLikeRows: true,
};

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
