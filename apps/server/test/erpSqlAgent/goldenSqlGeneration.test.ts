import assert from "node:assert/strict";
import test from "node:test";
import { metricMatchesExpectedFamily, semanticMismatchError } from "../../src/modules/erpSqlAgent/scripts/runGoldenSqlGeneration.js";

test("golden SQL accepts approved open shipping metrics as family_037", () => {
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_open_shipping_amount",
    sourceType: "metric",
    metricCode: "open_shipping_amount",
  }, ["family_037"]), true);
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_open_shipping_qty",
    sourceType: "metric",
    metricCode: "open_shipping_qty",
  }, ["family_037"]), true);
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_order_amount",
    sourceType: "metric",
    metricCode: "order_amount",
  }, ["family_037"]), false);
});

test("golden SQL accepts business type fallback when references are absent", () => {
  assert.equal(semanticMismatchError("production_task_progress", ["family_031"], []), undefined);
  assert.match(semanticMismatchError("production_task_progress", ["family_076"], []) ?? "", /semantic_mismatch/u);
});

test("golden SQL accepts approved cost metrics as family_059", () => {
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_material_cost_amount",
    sourceType: "metric",
    metricCode: "material_cost_amount",
  }, ["family_059"]), true);
});

test("golden SQL accepts approved finance metrics for purchase and margin families", () => {
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_purchase_amount",
    sourceType: "metric",
    metricCode: "purchase_amount",
  }, ["family_049"]), true);
  assert.equal(metricMatchesExpectedFamily({
    familyId: "atomic_gross_margin_rate",
    sourceType: "metric",
    metricCode: "gross_margin_rate",
  }, ["family_100"]), true);
});
