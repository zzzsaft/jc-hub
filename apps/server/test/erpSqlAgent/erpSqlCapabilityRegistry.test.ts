import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseGoldenCapabilityCase } from "../../src/modules/erpSqlAgent/capabilities/goldenContract.js";
import { resolveCapability } from "../../src/modules/erpSqlAgent/capabilities/registry.js";

const GOLDEN_FILE = fileURLToPath(new URL("../../src/modules/erpSqlAgent/templates/golden/sqlTemplateGoldenQuestions.json", import.meta.url));

function loadGoldenCases() {
  const value = JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as { cases?: unknown[] };
  assert.ok(Array.isArray(value.cases));
  return value.cases.map(parseGoldenCapabilityCase);
}

test("every golden case declares one capability and expected outcome", () => {
  const cases = loadGoldenCases();
  assert.equal(cases.length, 187);
  for (const item of cases) {
    assert.ok(item.capability);
    assert.match(item.expectedOutcome, /^(execute|clarify|unsupported)$/);
    assert.ok(resolveCapability(item.capability), item.capability);
    assert.ok(Array.isArray(item.requiredMetrics));
    assert.ok(Array.isArray(item.requiredDimensions));
    assert.ok(Array.isArray(item.requiredFilters));
    assert.ok(Array.isArray(item.requiredTimeSemantics));
    assert.ok(Array.isArray(item.allowedTemplateFamilies));
    assert.equal(item.expectedOutcome === "unsupported", item.unsupportedReason !== null);
  }
});

test("quotation capabilities are unsupported until a data source is published", () => {
  const result = resolveCapability("quotation.contract_config");
  assert.equal(result.status, "unsupported");
  assert.equal(result.reasonCode, "missing_approved_data_source");
});

test("executable golden requirements stay within published capability coverage", () => {
  for (const item of loadGoldenCases().filter((entry) => entry.expectedOutcome === "execute")) {
    const capability = resolveCapability(item.capability);
    assert.equal(capability.status, "executable", item.capability);
    for (const metric of item.requiredMetrics) assert(capability.metrics.includes(metric), `${item.capability} metric ${metric}`);
    for (const dimension of item.requiredDimensions) assert(capability.dimensions.includes(dimension), `${item.capability} dimension ${dimension}`);
    for (const filter of item.requiredFilters) assert(capability.filterSlots.includes(filter), `${item.capability} filter ${filter}`);
    for (const time of item.requiredTimeSemantics) assert(capability.timeSemantics.includes(time), `${item.capability} time ${time}`);
    for (const family of item.allowedTemplateFamilies) assert(capability.templateFamilies.includes(family), `${item.capability} family ${family}`);
  }
});

test("safety stock, operation labor, and finance use narrower capabilities", () => {
  const cases = loadGoldenCases();
  assert(cases.some((item) => item.capability === "inventory.safety_stock"));
  assert(cases.some((item) => item.capability === "operation.labor_reporting"));
  assert(cases.some((item) => item.capability.startsWith("finance.")));
  assert(cases.every((item) => item.capability !== item.businessType));
});
