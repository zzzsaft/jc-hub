import assert from "node:assert/strict";
import test from "node:test";
import {
  planSearchPolicyBatch1Updates,
  SEARCH_POLICY_BATCH1,
} from "../../src/productConfigAgent/scripts/configureSearchPolicyBatch1.js";
import { summarizeExtractionToInsertGateAudit } from "../../src/productConfigAgent/scripts/auditExtractionToInsert.js";

test("search policy batch1 payload keeps high-impact term type policies stable", () => {
  const policies = Object.fromEntries(SEARCH_POLICY_BATCH1.map((entry) => [entry.termType, entry]));

  assert.deepEqual(policies.product_type, {
    termType: "product_type",
    tier: "primary",
    spaces: ["similarity", "keyword", "quote", "context"],
  });
  assert.deepEqual(policies.product_effective_width, {
    termType: "product_effective_width",
    tier: "secondary",
    spaces: ["similarity", "keyword", "quote", "context"],
  });
  assert.deepEqual(policies.filter_model, {
    termType: "filter_model",
    tier: "tertiary",
    spaces: ["keyword", "quote", "context"],
  });
  assert.deepEqual(policies.deckle_note, {
    termType: "deckle_note",
    tier: "context",
    spaces: ["context"],
  });
  assert.equal(SEARCH_POLICY_BATCH1.length, 17);
});

test("search policy batch1 update plan preserves existing metadata and reports skipped and missing", () => {
  const plan = planSearchPolicyBatch1Updates([
    {
      id: "1",
      termType: "product_type",
      isActive: true,
      metadata: { valueKind: "enum", existingFlag: true },
    },
    {
      id: "2",
      termType: "application",
      isActive: true,
      metadata: {
        valueKind: "enum",
        searchPolicy: { tier: "primary", spaces: ["similarity", "keyword", "quote", "context"] },
      },
    },
    {
      id: "3",
      termType: "inactive_should_not_count",
      isActive: false,
      metadata: {},
    },
  ]);

  const productTypeUpdate = plan.updated.find((item) => item.termType === "product_type");
  assert.ok(productTypeUpdate);
  assert.deepEqual(productTypeUpdate.afterMetadata, {
    valueKind: "enum",
    existingFlag: true,
    searchPolicy: { tier: "primary", spaces: ["similarity", "keyword", "quote", "context"] },
  });
  assert.ok(plan.skipped.includes("application"));
  assert.ok(plan.missing.includes("plastic_material"));
  assert.equal(plan.updated.some((item) => item.termType === "application"), false);
});

test("extraction-to-insert audit summarizes gate modes and unresolved fields deterministically", () => {
  const report = summarizeExtractionToInsertGateAudit([
    {
      id: "blocked",
      documentId: "10",
      normalizedExtractionJson: { items: [] },
    },
    {
      id: "partial",
      documentId: "11",
      normalizedExtractionJson: {
        items: [
          {
            item_index: 1,
            item_name: "Named item",
            fields: [
              {
                field_name: "custom_unknown",
                raw_value: "mystery",
              },
              {
                field_name: "application",
                raw_value: "coating",
                dictionary: { term_type: "application", matched: false },
              },
            ],
          },
        ],
      },
    },
    {
      id: "full",
      documentId: "12",
      normalizedExtractionJson: {
        items: [
          {
            item_index: 1,
            item_name: "Flat die",
            item_quantity: "1",
            product_type_hint: { value: "flat_die" },
            fields: {
              application: "coating",
              plastic_material: "PP",
              effective_width_mm: { value: 1200, unit: "mm" },
            },
          },
        ],
      },
    },
  ]);

  assert.equal(report.sampleSize, 3);
  assert.equal(report.canInsert, 2);
  assert.equal(report.blocked, 1);
  assert.equal(report.full, 1);
  assert.equal(report.partial, 1);
  assert.equal(report.emptyItems, 1);
  assert.deepEqual(report.blockingReasons, { missing_required_field: 1 });
  assert.deepEqual(report.unresolvedReasons, {
    dictionary_not_matched: 1,
    unconfirmed_field_semantics: 1,
  });
  assert.deepEqual(report.unresolvedFields, {
    application: 1,
    custom_unknown: 1,
  });
  assert.deepEqual(report.blockedExamples.map((item) => item.extractionResultId), ["blocked"]);
});
