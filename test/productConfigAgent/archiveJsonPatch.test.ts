import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedArchivePatchChanges,
  assertAllowedArchivePatchChangesAgainstSnapshot,
  collapseArchivePatchArrayChanges,
  validateArchivePatchChanges,
  writePath,
} from "../../src/productConfigAgent/archive/jsonPatch.js";

test("archive json patch validator allows editable docInfo and item paths", () => {
  assert.doesNotThrow(() =>
    assertAllowedArchivePatchChanges([
      { path: "docInfo.product_number.value" },
      { path: "docInfo.contract_number" },
      { path: "items.0.itemName" },
      { path: "items.1.itemQuantity" },
      { path: "items.2.fields" },
      { path: "items.2.warnings" },
    ]),
  );
});

test("archive json patch validator rejects status/id/binding/prototype paths", () => {
  const rejected = validateArchivePatchChanges([
    { path: "currentVersion" },
    { path: "status" },
    { path: "id" },
    { path: "items.0.id" },
    { path: "items.0.productBindings" },
    { path: "items.0.fields.0.raw_value" },
    { path: "__proto__.polluted" },
    { path: "docInfo.unknown_key.value" },
  ]);

  assert.deepEqual(
    rejected.map((item) => item.path),
    [
      "currentVersion",
      "status",
      "id",
      "items.0.id",
      "items.0.productBindings",
      "items.0.fields.0.raw_value",
      "__proto__.polluted",
      "docInfo.unknown_key.value",
    ],
  );
  assert.throws(() => assertAllowedArchivePatchChanges([{ path: "constructor.polluted" }]), /constructor\.polluted/);
});

test("archive json patch validates item index against current snapshot", () => {
  assert.throws(
    () =>
      assertAllowedArchivePatchChangesAgainstSnapshot(
        { items: [{ id: "1", itemName: "old" }] },
        [{ path: "items.1.itemName" }],
      ),
    /archive item index does not exist/,
  );

  assert.doesNotThrow(() =>
    assertAllowedArchivePatchChangesAgainstSnapshot(
      { items: [{ id: "1", itemName: "old" }] },
      [{ path: "items.0.itemName" }],
    ),
  );
});

test("archive json patch collapses array element edits into whole-array changes", () => {
  const collapsed = collapseArchivePatchArrayChanges(
    {
      items: [
        {
          id: "1",
          fields: [{ normalized_name: "product_type", dictionary: { matched: false } }],
        },
      ],
    },
    [
      { path: "items.0.fields.0.dictionary.display_name", value: "XPM optical" },
      { path: "items.0.fields.0.dictionary.canonical_value", value: "XPM_optical" },
      { path: "items.0.fields.0.dictionary.matched", value: true },
    ],
  );

  assert.deepEqual(collapsed, [
    {
      path: "items.0.fields",
      value: [
        {
          normalized_name: "product_type",
          dictionary: {
            display_name: "XPM optical",
            canonical_value: "XPM_optical",
            matched: true,
          },
        },
      ],
    },
  ]);
});

test("archive json patch writer blocks dangerous segments", () => {
  assert.throws(() => writePath({}, "__proto__.polluted", true), /dangerous path segment is not allowed/);
  assert.throws(
    () =>
      collapseArchivePatchArrayChanges(
        { items: [{ id: "1", fields: [] }] },
        [{ path: "items.0.fields.0.__proto__.polluted", value: true }],
      ),
    /dangerous path segment is not allowed/,
  );
});
