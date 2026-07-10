import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import { buildLlmText, findConvertedXlsx, parseExcelFile, parseOptionsFromText, parseWorkbook, sanitizeExcelText } from "../../src/modules/productConfigAgent/excelParser/index.js";

test("parseExcelFile extracts sheet and row blocks with llm_text", async () => {
  const filePath = path.join(os.tmpdir(), `product-config-agent-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["产品", "型号"],
    ["模头", "JDY-1"],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "配置表");
  XLSX.writeFile(workbook, filePath);

  const result = await parseExcelFile({
    filePath,
    fileName: "配置表.xlsx",
    options: { includeRowBlocks: true },
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.file_name, "配置表.xlsx");
  assert.ok(result.data.blocks.some((block) => block.type === "cell" && block.text.includes("JDY-1")));
  assert.ok(result.data.blocks.some((block) => block.type === "row" && block.source.range.includes("A2")));
  assert.match(result.data.llm_text ?? "", /配置表/);
});

test("parseExcelFile defaults to cell-only blocks for persisted parser v2", async () => {
  const filePath = path.join(os.tmpdir(), `product-config-agent-cell-only-${Date.now()}.xlsx`);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["产品"], ["模头"]]), "配置表");
  XLSX.writeFile(workbook, filePath);

  const result = await parseExcelFile({ filePath });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.ok(result.data.blocks.some((block) => block.type === "cell"));
  assert.equal(result.data.blocks.some((block) => block.type === "row"), false);
});

test("row block ids are namespaced and do not collide with R1 cells", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[]]);
  sheet.R1 = { t: "s", v: "cell R1" };
  sheet["!ref"] = "R1:R1";
  XLSX.utils.book_append_sheet(workbook, sheet, "S");

  const blocks = await parseWorkbook(workbook, { includeRowBlocks: true });
  const ids = blocks.map((block) => block.block_id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("S_R1"));
  assert.ok(ids.includes("row:S:1"));
});

test("parseWorkbook preserves comments and hidden row metadata", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["产品"]]);
  sheet.A1.c = [{ t: "业务备注" }];
  sheet["!rows"] = [{ hidden: true }];
  XLSX.utils.book_append_sheet(workbook, sheet, "配置表");

  const blocks = await parseWorkbook(workbook);
  const cell = blocks.find((block) => block.type === "cell" && block.source.cell === "A1");

  assert.ok(cell);
  assert.equal(cell.comment_text, "业务备注");
  assert.equal(cell.source.hidden, true);
  assert.match(buildLlmText({ file_name: "x.xlsx", source_type: "local", blocks }), /\[批注\] 业务备注/);
});

test("parseWorkbook quarantines workbooks when sanitizer drops most populated cells", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 10 }, () => ["\u0081"]));
  XLSX.utils.book_append_sheet(workbook, sheet, "配置表");

  await assert.rejects(
    () => parseWorkbook(workbook),
    (error: any) => error?.code === "SANITIZED_CONTENT_QUARANTINED",
  );
});

test("sanitizeExcelText removes nulls and normalizes whitespace", () => {
  assert.equal(sanitizeExcelText(" A\u0000\t B\r\n"), " A\t B\r\n");
});

test("parseOptionsFromText extracts selected options and buildLlmText emits option_set", () => {
  const parsed = parseOptionsFromText("模唇调节：☑ 自动 □ 手动");
  assert.equal(parsed.options.length, 2);
  assert.equal(parsed.options[0].selected, true);
  const text = buildLlmText({
    file_name: "x.xlsx",
    source_type: "local",
    blocks: [
      {
        block_id: "S_A1",
        id: "S_A1",
        type: "cell",
        text: parsed.normalizedText,
        raw_text: "模唇调节：☑ 自动 □ 手动",
        options: parsed.options,
        source: {
          sheet_name: "S",
          kind: "cell",
          cell: "A1",
          row: 1,
          col: 1,
          sheet_range: "A1:A1",
          merge_range: null,
        },
      },
    ],
  });
  assert.match(text, /option_set/);
  assert.match(text, /"selected":true/);
});

test("findConvertedXlsx handles conversion output names with spaces and picks the newest candidate", async () => {
  const outputDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "product-config-xls-convert-"));
  try {
    const older = path.join(outputDir, "old output.xlsx");
    const newer = path.join(outputDir, "配置 单.xlsx");
    await fs.promises.writeFile(older, "old");
    await new Promise((resolve) => setTimeout(resolve, 15));
    await fs.promises.writeFile(newer, "new");
    assert.equal(await findConvertedXlsx(outputDir), newer);
  } finally {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
  }
});
