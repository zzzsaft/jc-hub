import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyErpSqlAccessScope, requireTemplateModuleAccessMapping } from "../../src/modules/erpSqlAgent/access/index.js";
import { SqlRuntimeGuardService } from "../../src/modules/erpSqlAgent/runtimeGuard/index.js";

const FAST_PATHS = readFileSync(new URL("../../prisma/migrations/20260710030000_erp_golden_family_fast_paths/migration.sql", import.meta.url), "utf8");
const OPERATION_PUBLICATION = readFileSync(new URL("../../prisma/migrations/20260712010000_erp_sql_inventory_operation_capabilities/migration.sql", import.meta.url), "utf8");
const scope = {
  source: "server" as const,
  actorUserId: "tester",
  companies: ["EPIC03"],
  modules: ["production"],
  departments: "*" as const,
  businessUnits: "*" as const,
  customerNumbers: "*" as const,
  sensitive: { finance: "masked" as const, customer: "masked" as const, employee: "full" as const },
  auditReasons: [],
};

test("published operation templates are TOP bounded and access-scope enforceable", () => {
  const assets = [
    { sql: sqlAfter(FAST_PATHS, "报工班组资源组辅助字典"), module: "production_master_data" },
    { sql: sqlAfter(FAST_PATHS, "工单报工明细查询"), module: "production" },
    { sql: sqlAfter(OPERATION_PUBLICATION, "工序字典查询"), module: "production_master_data" },
  ];
  for (const asset of assets) {
    assert.match(asset.sql, /^SELECT TOP 100/u);
    assert.equal(requireTemplateModuleAccessMapping(asset.module), "production");
    const scoped = applyErpSqlAccessScope(asset.sql, scope);
    assert.match(scoped, /Company IN \(N'EPIC03'\)/u);
  }
});

test("published operation templates pass semantic runtime guard", async () => {
  const guard = new SqlRuntimeGuardService({
    async validate(sql: string) {
      return { valid: true, errors: [], warnings: [], normalizedSql: sql, referencedTables: [], referencedFields: [] };
    },
  });
  const cases = [
    { question: "查员工报工记录", familyId: "family_092", sql: sqlAfter(FAST_PATHS, "工单报工明细查询") },
    { question: "查有哪些班组和资源群组", familyId: "family_014", sql: sqlAfter(FAST_PATHS, "报工班组资源组辅助字典") },
    { question: "查 OpMaster 工序资料", familyId: "family_038", sql: sqlAfter(OPERATION_PUBLICATION, "工序字典查询") },
  ];
  for (const item of cases) {
    const result = await guard.validate({
      question: item.question,
      sql: item.sql,
      source: "template",
      references: [{ familyId: item.familyId, businessDescription: item.question, coreTables: [], joins: [], sourceType: "template" }],
    });
    assert.equal(result.valid, true, `${item.familyId}: ${result.guardResult.errors.join("; ")}`);
  }
});

function sqlAfter(migration: string, marker: string): string {
  const tail = migration.slice(migration.indexOf(marker));
  const match = tail.match(/\$sql\$([\s\S]*?)\$sql\$/u);
  assert(match, marker);
  return match[1].trim();
}
