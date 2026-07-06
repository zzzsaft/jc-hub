import assert from "node:assert/strict";
import test from "node:test";
import {
  SqlGeneratorService,
  type SqlGeneratorGuard,
} from "../../src/modules/erpSqlAgent/generator/index.js";
import type { SqlGuardResult } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { makeGeneratorPlan } from "./sqlGeneratorTestHelpers.js";

class FakeGuard implements SqlGeneratorGuard {
  readonly sql: string[] = [];

  constructor(private readonly valid = true) {}

  async validate(sql: string): Promise<SqlGuardResult> {
    this.sql.push(sql);
    return {
      valid: this.valid,
      errors: this.valid ? [] : ["blocked"],
      warnings: [],
      normalizedSql: sql.trim(),
      referencedTables: [],
      referencedFields: [],
    };
  }
}

test("purchase delayed vendor plan generates SELECT with joins, date safety, and grouping", async () => {
  const guard = new FakeGuard();
  const generator = new SqlGeneratorService(guard);

  const result = await generator.generate(makeGeneratorPlan("purchase", "采购延期供应商统计", "aggregate", ["POHeader", "PODetail", "PORel", "Vendor"], true, "purchaseDelayVendor"));

  assert.equal(result.valid, true);
  assert.match(result.sql, /^SELECT/m);
  assert.match(result.sql, /poh\.Company AS Company/);
  assert.match(result.sql, /TOP 100/);
  assert.match(result.sql, /JOIN Erp\.PODetail pod/);
  assert.match(result.sql, /por\.DueDate >= '20000101'/);
  assert.match(result.sql, /por\.DueDate < DATEADD\(year, 1, CAST\(GETDATE\(\) AS date\)\)/);
  assert.match(result.sql, /GROUP BY/);
  assert.equal(guard.sql.length, 1);
});

test("guard failure returns valid false", async () => {
  const generator = new SqlGeneratorService(new FakeGuard(false));

  const result = await generator.generate(makeGeneratorPlan("purchase", "采购延期供应商统计", "aggregate", ["POHeader", "PODetail", "PORel", "Vendor"], true, "purchaseDelayVendor"));

  assert.equal(result.valid, false);
  assert.deepEqual(result.guardResult.errors, ["blocked"]);
});

test("purchase spend by type plan generates amount share SQL", async () => {
  const generator = new SqlGeneratorService(new FakeGuard());

  const result = await generator.generate(makeGeneratorPlan("purchase", "查看公司近三年的采购额和采购类型比例，钢材占采购额多少", "aggregate", ["POHeader", "PODetail", "Part", "PartClass"], true, "purchaseSpendByType"));

  assert.match(result.sql, /FROM Erp\.POHeader poh/);
  assert.match(result.sql, /JOIN Erp\.PODetail pod/);
  assert.match(result.sql, /LEFT JOIN Erp\.Part p/);
  assert.match(result.sql, /LEFT JOIN Erp\.PartClass pc/);
  assert.match(result.sql, /SUM\(pod\.DocExtCost\) AS \[采购额\]/);
  assert.match(result.sql, /PARTITION BY poh\.Company, YEAR\(poh\.OrderDate\)/);
  assert.match(result.sql, /poh\.OrderDate >= DATEADD\(year, -3, CAST\(GETDATE\(\) AS date\)\)/);
  assert.doesNotMatch(result.sql, /por\.DueDate/);
  assert.match(result.sql, /GROUP BY/);
});

test("purchase spend by type drops planner filters for aliases outside selected joins", async () => {
  const generator = new SqlGeneratorService(new FakeGuard());
  const plan = makeGeneratorPlan("purchase", "查看公司近三年的采购额和采购类型比例", "aggregate", ["POHeader", "PODetail", "Part", "PartClass"], true, "purchaseSpendByType");
  plan.keywordFilters = [...(plan.keywordFilters ?? []), { expression: "por.DueDate >= DATEADD(day, -1095, CAST(GETDATE() AS date))" }];

  const result = await generator.generate(plan);

  assert.doesNotMatch(result.sql, /por\.DueDate/);
  assert.match(result.sql, /poh\.OrderDate >= DATEADD\(year, -3, CAST\(GETDATE\(\) AS date\)\)/);
});

test("open job plan generates SQL", async () => {
  const generator = new SqlGeneratorService(new FakeGuard());

  const result = await generator.generate(makeGeneratorPlan("production", "未完工工单", "list", ["JobHead"], false, "openJob"));

  assert.match(result.sql, /FROM Erp\.JobHead jh/);
  assert.match(result.sql, /jh\.Company AS Company/);
  assert.match(result.sql, /jh\.JobClosed = 0/);
  assert.match(result.sql, /jh\.JobComplete = 0/);
});

test("inventory balance plan generates SQL", async () => {
  const generator = new SqlGeneratorService(new FakeGuard());

  const result = await generator.generate(makeGeneratorPlan("inventory", "库存余额", "list", ["PartWhse"], false, "inventoryBalance"));

  assert.match(result.sql, /FROM Erp\.PartWhse pw/);
  assert.match(result.sql, /pw\.OnHandQty AS \[库存数量\]/);
  assert.match(result.sql, /TOP 100/);
});

test("rule generator uses planner scenario instead of repicking from question", async () => {
  const generator = new SqlGeneratorService(new FakeGuard());

  const result = await generator.generate(makeGeneratorPlan("purchase", "采购延期供应商统计", "aggregate", ["POHeader", "PODetail"], true, "purchaseDetail"));

  assert.equal(result.scenario, "purchaseDetail");
  assert.doesNotMatch(result.sql, /延期次数/);
});
