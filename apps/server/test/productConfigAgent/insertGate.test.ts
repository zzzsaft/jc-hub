import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentReadyInsertGate } from "../../src/modules/productConfigAgent/archive/insertGate.js";

test("insert gate produces full_insert when all fields are confirmed", () => {
  const result = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      document_info: { contract_number: "C-1" },
      items: [
        {
          item_index: 1,
          item_name: "Flat die",
          item_quantity: "1",
          product_type_hint: { value: "flat_die", raw_value: "模头" },
          fields: {
            application: "coating",
            effective_width_mm: { value: 1200, unit: "mm", raw_value: "1200mm" },
            layer_count: 3,
          },
          raw_fields: [
            { field_name: "application", value: "coating", raw_text: "application coating" },
          ],
        },
      ],
    },
  });

  assert.equal(result.insertability.canInsert, true);
  assert.equal(result.insertability.insertMode, "full_insert");
  assert.equal(result.items[0].agentReadiness.similarityReady, true);
  assert.equal(result.items[0].similarityFeatures.product_type, "flat_die");
  assert.equal(result.items[0].similarityFeatures.effective_width_mm, 1200);
});

test("insert gate preserves candidates as unresolved partial_insert without blocking", () => {
  const result = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      document_info: { contract_number: "C-2" },
      items: [
        {
          item_index: 1,
          item_name: "Filter",
          item_quantity: "2",
          product_type_hint: { value: "filter" },
          fields: {
            application: "sheet",
            deckle_type: "unreviewed-deckle",
          },
          raw_fields: [
            { field_name: "deckle_type", value: "unreviewed-deckle", raw_text: "deckle_type unreviewed-deckle" },
          ],
        },
      ],
    },
    dictionaryProposals: {
      proposals: [
        {
          candidateType: "value",
          termType: "deckle_type",
          rawValue: "unreviewed-deckle",
          itemIndex: 1,
          fieldPath: "$.items[0].fields.deckle_type",
          reason: "missing_value_alias",
        },
      ],
    },
  });

  assert.equal(result.insertability.canInsert, true);
  assert.equal(result.insertability.insertMode, "partial_insert");
  assert.equal(result.items[0].insertability.insertMode, "partial_insert");
  assert.equal(result.items[0].unresolvedFields.length, 2);
  assert.match(result.items[0].searchableText, /\[UNRESOLVED\].*unreviewed-deckle/);
  assert.match(result.items[0].searchableText, /\[EVIDENCE\].*deckle_type unreviewed-deckle/);
  assert.equal(Object.prototype.hasOwnProperty.call(result.items[0].similarityFeatures, "deckle_type"), false);
});

test("insert gate blocks only missing item identity or empty items", () => {
  const empty = buildAgentReadyInsertGate({ normalizedExtractionJson: { items: [] } });
  assert.equal(empty.insertability.canInsert, false);
  assert.equal(empty.insertability.insertMode, "blocked");

  const missingIdentity = buildAgentReadyInsertGate({
    normalizedExtractionJson: { items: [{ item_index: 1, fields: {}, raw_fields: [] }] },
  });
  assert.equal(missingIdentity.insertability.canInsert, false);
  assert.equal(missingIdentity.items[0].insertability.insertMode, "blocked");

  const itemNameOnly = buildAgentReadyInsertGate({
    normalizedExtractionJson: { items: [{ item_index: 1, item_name: "Named item", fields: {}, raw_fields: [] }] },
  });
  assert.equal(itemNameOnly.insertability.canInsert, true);
  assert.equal(itemNameOnly.items[0].agentReadiness.searchable, true);
  assert.equal(itemNameOnly.items[0].agentReadiness.similarityReady, false);
});

test("insert gate marks missing quantity as quote-not-ready without blocking", () => {
  const result = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      items: [
        {
          item_index: 1,
          item_name: "Flat die",
          product_type_hint: { value: "flat_die" },
          fields: {
            effective_width_mm: { value: 900, unit: "mm", raw_value: "900mm" },
            layer_count: 1,
          },
        },
      ],
    },
  });

  assert.equal(result.insertability.canInsert, true);
  assert.equal(result.items[0].agentReadiness.quoteReady, false);
  assert.ok(result.items[0].agentReadiness.missingForQuote.includes("item_quantity"));
});

test("flat die quote readiness requires width and material or application", () => {
  const missingWidth = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      items: [
        {
          item_index: 1,
          item_name: "Flat die",
          item_quantity: "1",
          product_type_hint: { value: "flat_die" },
          fields: { application: "sheet" },
        },
      ],
    },
  });
  assert.equal(missingWidth.items[0].agentReadiness.quoteReady, false);
  assert.ok(missingWidth.items[0].agentReadiness.missingForQuote.includes("effective_width_mm_or_die_width_mm"));

  const missingMaterialOrApplication = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      items: [
        {
          item_index: 1,
          item_name: "Flat die",
          item_quantity: "1",
          product_type_hint: { value: "flat_die" },
          fields: { effective_width_mm: { value: 900, unit: "mm", raw_value: "900mm" } },
        },
      ],
    },
  });
  assert.equal(missingMaterialOrApplication.items[0].agentReadiness.quoteReady, false);
  assert.ok(missingMaterialOrApplication.items[0].agentReadiness.missingForQuote.includes("plastic_material_or_application"));

  const ready = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      items: [
        {
          item_index: 1,
          item_name: "Flat die",
          item_quantity: "1",
          product_type_hint: { value: "flat_die" },
          fields: {
            effective_width_mm: { value: 900, unit: "mm", raw_value: "900mm" },
            plastic_material: "PP",
          },
        },
      ],
    },
  });
  assert.equal(ready.items[0].agentReadiness.quoteReady, true);
  assert.deepEqual(ready.items[0].agentReadiness.missingForQuote, []);
});

test("searchable text keeps confirmed and unresolved boundaries", () => {
  const result = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      document_info: { contract_number: "C-3" },
      items: [
        {
          item_index: 1,
          item_name: "Coating die",
          item_quantity: "1",
          product_type_hint: { value: "coating_die", raw_value: "涂布模头" },
          fields: {
            effective_width_mm: { value: 1500, unit: "mm", raw_value: "1500mm" },
            custom_unknown: "mystery",
          },
          raw_fields: [
            { field_name: "custom_unknown", value: "mystery", raw_text: "raw custom mystery" },
          ],
        },
      ],
    },
  });

  assert.match(result.items[0].searchableText, /\[DOC\].*C-3/);
  assert.match(result.items[0].searchableText, /\[ITEM\].*Coating die/);
  assert.match(result.items[0].searchableText, /\[CONFIRMED\].*effective_width_mm/);
  assert.match(result.items[0].searchableText, /\[UNRESOLVED\].*custom_unknown/);
  assert.match(result.items[0].searchableText, /\[EVIDENCE\].*raw custom mystery/);
});

test("does not promote dictionary unmatched array fields to confirmed fields", () => {
  const result = buildAgentReadyInsertGate({
    normalizedExtractionJson: {
      items: [
        {
          item_index: 1,
          item_name: "模头",
          item_quantity: "1套",
          product_type_hint: { value: "flat_die" },
          fields: [
            {
              field_name: "适用塑料原料",
              raw_value: "PP片材",
              raw_text: "PP片材",
              dictionary: { matched: false },
            },
            {
              field_name: "塑料原料",
              raw_value: "PP",
              raw_text: "PP",
              dictionary: {
                matched: true,
                term_type: "plastic_material",
                value_kind: "enums",
                values: [{ canonicalValue: "PP", displayName: "PP" }],
              },
            },
            {
              field_name: "应用类型",
              raw_value: "片材",
              raw_text: "片材",
              dictionary: {
                matched: true,
                term_type: "application",
                value_kind: "enum",
                canonical_value: "片材",
                display_name: "片材",
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(Object.prototype.hasOwnProperty.call(result.items[0].confirmedFields, "适用塑料原料"), false);
  assert.deepEqual(result.items[0].confirmedFields.plastic_material, ["PP"]);
  assert.equal(result.items[0].confirmedFields.application, "片材");
  assert.ok(result.items[0].unresolvedFields.some((field) => field.fieldName === "适用塑料原料" && field.reason === "unconfirmed_field_semantics"));
});
