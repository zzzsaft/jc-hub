import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import { buildLlmText, parseExcelFile, parseOptionsFromText, sanitizeExcelText } from "../../src/modules/productConfigAgent/excelParser/index.js";

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
