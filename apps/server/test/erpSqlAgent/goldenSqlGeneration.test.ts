import assert from "node:assert/strict";
import test from "node:test";
import { metricMatchesExpectedFamily } from "../../src/modules/erpSqlAgent/scripts/runGoldenSqlGeneration.js";

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
