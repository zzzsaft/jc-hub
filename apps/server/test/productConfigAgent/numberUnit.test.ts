import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNumberUnit, normalizeUnitAliasText } from "../../src/modules/productConfigAgent/dictionary/numberUnit.js";

test("normalizeNumberUnit parses range, canonical unit aliases, and numeric bounds", () => {
  const aliases = new Map([
    ["mm", { id: "u1", canonicalUnit: "mm", displayUnit: "mm" }],
    ["kg/h", { id: "u2", canonicalUnit: "kg/h", displayUnit: "kg/h" }],
  ]);
  const result = normalizeNumberUnit(" 3～5 毫米 ", aliases);
  assert.equal(result.numberKind, "range");
  assert.equal(result.rangeStart, "3");
  assert.equal(result.rangeEnd, "5");
  assert.equal(result.rangeMin, "3");
  assert.equal(result.rangeMax, "5");
  assert.equal(result.unitRaw, "毫米");
  assert.deepEqual(result.warnings, ["unit_alias_no_match"]);
});

test("normalizeNumberUnit keeps known unit prefix and exposes trailing split evidence", () => {
  const aliases = new Map([["mm", { id: "u1", canonicalUnit: "mm", displayUnit: "mm" }]]);
  const result = normalizeNumberUnit("12mm宽度30", aliases);
  assert.equal(result.numberKind, "single");
  assert.equal(result.unitCanonical, "mm");
  assert.equal(result.trailingFieldName, "宽度");
  assert.equal(result.trailingRawValue, "30");
  assert.ok(result.warnings.includes("number_unit_trailing_text"));
});

test("normalizeUnitAliasText normalizes common unicode unit variants", () => {
  assert.equal(normalizeUnitAliasText(" μm / hour "), "um/h");
  assert.equal(normalizeUnitAliasText("°C"), "℃");
});
