import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseTemplateSql,
  replaceTemplateParams,
  SqlTemplateDraftValidationService,
  writeSqlTemplateDraftValidationOutputs,
} from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateDraftValidationService.js";
import { buildDraftDebugReport } from "../../src/modules/erpSqlAgent/templates/scripts/debugSqlTemplateDraft.js";
import { ErpSqlQueryError, type ErpSqlQueryResult } from "../../src/modules/erpSqlAgent/query/index.js";

test("draft validation parses aliases, columns, and parameters", () => {
  const parsed = parseTemplateSql("SELECT p.Company, p.PartNum FROM Erp.Part p WHERE p.Company = @companyScope AND p.PartNum = @partNum");

  assert.deepEqual(parsed.tables, [{ schema: "Erp", table: "Part", alias: "p" }]);
  assert(parsed.columns.some((column) => column.table === "Erp.Part" && column.column === "PartNum"));
  assert.deepEqual(parsed.parameterNames, ["companyScope", "partNum"]);
});

test("draft validation replaces params with safe literals", () => {
  const sql = replaceTemplateParams("WHERE Company=@companyScope AND PartNum=@partNum AND Flag=@onlyOpen", "jctimes");

  assert.equal(sql, "WHERE Company='jctimes' AND PartNum=NULL AND Flag=0");
});

test("draft validation checks metadata, compile, and skips sample by default", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-validation-"));
  const reviewJson = path.join(dir, "review.json");
  await fs.writeFile(reviewJson, JSON.stringify({ templateDrafts: [templateDraft()] }), "utf8");
  const client = new FakeQueryClient({
    "Erp.Part": [["Company", "nvarchar"], ["PartNum", "nvarchar"], ["PartDescription", "nvarchar"]],
  });

  const report = await new SqlTemplateDraftValidationService(client).validate({ reviewJsonPath: reviewJson, company: "jctimes" });

  assert.equal(report.summary.templateCount, 1);
  assert.equal(report.summary.compilePassCount, 1);
  assert.equal(report.templates[0]?.sampleValidation.status, "skipped");
  assert(report.templates[0]?.schemaValidation.missingColumns.some((column) => column.column === "MissingCol"));
  assert(client.calls.some((call) => call.sql.includes("INFORMATION_SCHEMA.COLUMNS")));
  assert(client.calls.some((call) => call.sql.includes("SELECT TOP 0 * FROM")));
  assert(!client.calls.some((call) => call.sql.includes("draft_sample")));
});

test("draft validation writes json and markdown", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-validation-"));
  const reviewJson = path.join(dir, "review.json");
  const out = path.join(dir, "validation.json");
  const mdOut = path.join(dir, "validation.md");
  await fs.writeFile(reviewJson, JSON.stringify({ templateDrafts: [templateDraft()] }), "utf8");
  const report = await new SqlTemplateDraftValidationService(new FakeQueryClient()).validate({ reviewJsonPath: reviewJson, company: "jctimes" });

  await writeSqlTemplateDraftValidationOutputs(report, { out, mdOut });

  const json = JSON.parse(await fs.readFile(out, "utf8")) as typeof report;
  const markdown = await fs.readFile(mdOut, "utf8");
  assert.equal(json.summary.templateCount, 1);
  assert(markdown.includes("## Summary"));
  assert(markdown.includes("family_050 - 库存明细查询"));
});

test("draft validation includes compile debug when executor fails", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-validation-"));
  const reviewJson = path.join(dir, "review.json");
  await fs.writeFile(reviewJson, JSON.stringify({ templateDrafts: [templateDraft()] }), "utf8");
  const client = new FakeQueryClient({ "Erp.Part": [["Company", "nvarchar"], ["PartNum", "nvarchar"], ["MissingCol", "nvarchar"]] });
  client.compileError = new ErpSqlQueryError("Internal Server Error", 500, { message: "Internal Server Error" });

  const report = await new SqlTemplateDraftValidationService(client).validate({ reviewJsonPath: reviewJson, company: "jctimes" });
  const compile = report.templates[0]?.compileValidation;

  assert.equal(compile?.status, "fail");
  assert.equal(compile?.rawExecutorStatusCode, 500);
  assert.equal(compile?.rawExecutorErrorMessage, "Internal Server Error");
  assert(compile?.expandedCompileSql?.includes("SELECT TOP 0 * FROM"));
  assert.deepEqual(compile?.parameterSubstitutions, { "@companyScope": "'jctimes'", "@partNum": "NULL" });
});

test("draft debug report extracts one family and runs only TOP 1 probes when requested", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-debug-"));
  const validationPath = path.join(dir, "validation.json");
  await fs.writeFile(validationPath, JSON.stringify({
    templates: [
      { familyId: "family_050", name: "skip me", compileValidation: { compileStatus: "pass" } },
      {
        familyId: "family_062",
        name: "采购到货跟踪查询",
        compileValidation: {
          compileStatus: "fail",
          rawExecutorStatusCode: 500,
          rawExecutorErrorMessage: "Internal Server Error",
          rawExecutorResponseBody: "Internal Server Error",
          expandedCompileSql: "SELECT TOP 0 * FROM (\nSELECT 1 AS ok\n) AS draft_validate",
          parameterSubstitutions: { "@companyScope": "'jctimes'" },
          validationMode: "compile_top_0_wrapped_select",
        },
      },
    ],
  }), "utf8");
  const client = new FakeQueryClient();

  const report = await buildDraftDebugReport({ validationPath, familyId: "family_062", runProbes: true, queryClient: client });

  assert.equal(report.templateName, "采购到货跟踪查询");
  assert.equal(report.inner_template_sql, "SELECT 1 AS ok");
  assert.equal(report.rawExecutorErrorMessage, "Internal Server Error");
  assert.equal(report.probes.length, 2);
  assert(client.calls.every((call) => /^\s*SELECT\s+TOP\s+1\b/iu.test(call.sql)));
  assert(client.calls.every((call) => call.sql.includes("poh.Company = 'jctimes'")));
});

class FakeQueryClient {
  readonly calls: Array<{ sql: string; maxRows?: number }> = [];
  compileError?: Error;

  constructor(private readonly columnsByTable: Record<string, unknown[][]> = {}) {}

  async query(options: { sql: string; maxRows?: number }): Promise<ErpSqlQueryResult> {
    this.calls.push(options);
    const tableMatch = options.sql.match(/TABLE_SCHEMA = '([^']+)'[\s\S]*TABLE_NAME = '([^']+)'/u);
    if (tableMatch) {
      const rows = this.columnsByTable[`${tableMatch[1]}.${tableMatch[2]}`] ?? [["Company", "nvarchar"], ["PartNum", "nvarchar"]];
      return { fields: ["COLUMN_NAME", "DATA_TYPE"], rows, rowCount: rows.length, truncated: false };
    }
    if (this.compileError) throw this.compileError;
    return { fields: ["Company"], rows: [], rowCount: 0, truncated: false };
  }
}

function templateDraft() {
  return {
    familyId: "family_050",
    name: "库存明细查询",
    intent: "inventory_stock_detail",
    sqlTemplate: "SELECT p.Company, p.PartNum, p.MissingCol FROM Erp.Part p WHERE p.Company = @companyScope AND p.PartNum = @partNum",
  };
}
