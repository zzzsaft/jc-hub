import assert from "node:assert/strict";
import test from "node:test";
import type { SqlGeneratorGuard } from "../../src/modules/erpSqlAgent/generator/index.js";
import { SqlRuntimeGuardService } from "../../src/modules/erpSqlAgent/runtimeGuard/index.js";
import type { SqlGuardOptions, SqlGuardResult } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";

class PassingSchemaGuard implements SqlGeneratorGuard {
  readonly sql: string[] = [];

  async validate(sql: string, _options?: SqlGuardOptions): Promise<SqlGuardResult> {
    this.sql.push(sql);
    return {
      valid: true,
      errors: [],
      warnings: [],
      normalizedSql: sql,
      referencedTables: ["Erp.OrderHed"],
      referencedFields: ["Company"],
    };
  }
}

test("runtime guard rejects a schema-valid candidate from the wrong semantic family", async () => {
  const schemaGuard = new PassingSchemaGuard();
  const guard = new SqlRuntimeGuardService(schemaGuard);
  const sql = "SELECT TOP 100 Company FROM Erp.OrderHed";

  const result = await guard.validate({
    question: "查询物料 A123 的库存",
    sql,
    source: "template",
    references: [{
      familyId: "family_016",
      businessDescription: "销售订单明细",
      coreTables: ["Erp.OrderHed"],
      joins: [],
      sourceType: "template",
    }],
  });

  assert.equal(schemaGuard.sql.length, 1);
  assert.equal(result.valid, false);
  assert.equal(result.sql, "");
  assert.equal(result.candidateSql, sql);
  assert.equal(result.semanticResult.status, "semantic_mismatch");
  assert.deepEqual(result.semanticResult.expectedFamilyIds.sort(), ["family_027", "family_050"]);
  assert(result.guardResult.errors.some((error) => error.startsWith("semantic_mismatch:")));
});

test("runtime guard keeps a semantically matching low-confidence estimate distinct from mismatch", async () => {
  const guard = new SqlRuntimeGuardService(new PassingSchemaGuard());

  const result = await guard.validate({
    question: "产品毛利大概是多少",
    sql: "SELECT TOP 100 Company FROM Erp.OrderHed",
    source: "llm",
    references: [{
      familyId: "family_100",
      businessDescription: "订单毛利参考",
      coreTables: ["Erp.OrderHed"],
      joins: [],
      sourceType: "dataset",
    }],
    analysisPlan: {
      mode: "decision_support",
      grain: ["product"],
      metrics: ["gross_margin_rate"],
      filters: [],
      dimensions: ["product"],
      orderBy: [],
    },
    financeMode: "estimate",
    lowConfidence: true,
  });

  assert.equal(result.valid, true);
  assert.equal(result.semanticResult.status, "estimate");
  assert.deepEqual(result.semanticResult.expectedFamilyIds, ["family_100"]);
  assert(result.semanticResult.actualFamilyIds.includes("family_100"));
});
