import assert from "node:assert/strict";
import test from "node:test";
import { buildProductConfigProgressLedgerFromRows } from "../../src/modules/productConfigAgent/progress/progressLedger.js";

const fullItems = {
  items: [{
    item_index: 1,
    item_name: "Flat die",
    item_quantity: "1",
    product_type_hint: { value: "flat_die" },
    fields: {
      application: "coating",
      effective_width_mm: { value: 1200, unit: "mm", raw_value: "1200mm" },
      layer_count: 3,
    },
  }],
};

function row(documentId: number, overrides: Record<string, unknown> = {}) {
  return {
    documentId,
    fileName: `${documentId}.xlsx`,
    source: "test",
    documentStatus: "uploaded",
    dictionaryDirty: false,
    hasBlocks: false,
    parserVersion: null,
    latestExtractionId: null,
    latestExtractionStatus: null,
    latestExtractionPlanJson: null,
    latestExtractionPromptVersion: null,
    latestExtractionDictionaryVersion: null,
    latestExtractionCreatedAt: null,
    latestNormalizedExtractionId: null,
    latestNormalizedExtractionStatus: null,
    latestNormalizedExtractionJson: null,
    latestNormalizedDictionaryProposals: null,
    latestNormalizedPromptVersion: null,
    latestNormalizedDictionaryVersion: null,
    latestNormalizedCreatedAt: null,
    archiveCount: 0,
    archivedCount: 0,
    archiveExtractionResultIds: [],
    latestArchiveId: null,
    latestArchiveStatus: null,
    latestArchiveDirtyReason: null,
    latestArchiveExtractionResultId: null,
    duplicateCount: 0,
    canonicalDocumentId: null,
    duplicateTypes: [],
    pendingCandidateOccurrences: 0,
    needsHumanReviewCandidateOccurrences: 0,
    ...overrides,
  } as any;
}

function ledgerById(report: ReturnType<typeof buildProductConfigProgressLedgerFromRows>, documentId: number) {
  const result = report.ledger.find((item) => item.documentId === documentId);
  assert.ok(result, `missing ledger row ${documentId}`);
  return result;
}

test("progress ledger keeps latest extraction separate from stale latest normalized result", () => {
  const report = buildProductConfigProgressLedgerFromRows({
    generatedAt: "2026-07-10T00:00:00.000Z",
    rows: [row(1001, {
      documentStatus: "dictionary_dirty",
      dictionaryDirty: false,
      hasBlocks: true,
      latestExtractionId: 12,
      latestExtractionStatus: "created",
      latestExtractionPlanJson: { items: [{ item_index: 1 }] },
      latestNormalizedExtractionId: 11,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: fullItems,
      archiveCount: 1,
      archivedCount: 1,
      archiveExtractionResultIds: [11],
      latestArchiveId: 50,
      latestArchiveStatus: "archived",
      latestArchiveExtractionResultId: 11,
    })],
  });

  const item = ledgerById(report, 1001);
  assert.equal(item.latestExtraction.id, 12);
  assert.equal(item.latestNormalizedExtraction.id, 11);
  assert.equal(item.terminalState, "needs_reextract");
  assert.ok(item.blockerCodes.includes("latest_normalized_stale"));
  assert.ok(item.warningCodes.includes("dictionary_dirty_status_drift"));
});

test("progress ledger distinguishes planned-only, empty, blocked, partial, full and archived rows", () => {
  const rows = [
    row(1, {
      hasBlocks: true,
      latestExtractionId: 1,
      latestExtractionStatus: "planned",
      latestExtractionJson: {},
      latestExtractionPlanJson: { items: [{ item_index: 1 }] },
    }),
    row(2, {
      hasBlocks: true,
      latestExtractionId: 2,
      latestNormalizedExtractionId: 2,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: { items: [] },
    }),
    row(3, {
      hasBlocks: true,
      latestExtractionId: 3,
      latestNormalizedExtractionId: 3,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: { items: [{ item_index: 1, fields: {}, raw_fields: [] }] },
    }),
    row(4, {
      hasBlocks: true,
      latestExtractionId: 4,
      latestNormalizedExtractionId: 4,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: {
        items: [{ item_index: 1, item_name: "Named item", product_type_hint: { value: "filter" }, fields: {} }],
      },
    }),
    row(5, {
      hasBlocks: true,
      latestExtractionId: 5,
      latestNormalizedExtractionId: 5,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: fullItems,
    }),
    row(6, {
      hasBlocks: true,
      latestExtractionId: 6,
      latestNormalizedExtractionId: 6,
      latestNormalizedExtractionStatus: "normalized",
      latestNormalizedExtractionJson: fullItems,
      archiveCount: 1,
      archivedCount: 1,
      archiveExtractionResultIds: [6],
      latestArchiveId: 60,
      latestArchiveStatus: "archived",
      latestArchiveExtractionResultId: 6,
    }),
  ];

  const report = buildProductConfigProgressLedgerFromRows({ rows });
  assert.deepEqual(
    report.ledger.map((item) => item.terminalState),
    ["planned", "normalized_empty", "normalized_blocked", "normalized_partial", "normalized_full", "archived"],
  );
  assert.ok(ledgerById(report, 2).blockerCodes.includes("empty_items"));
  assert.equal(ledgerById(report, 6).archive.linkedToLatestNormalized, true);
});

test("duplicate reference remains an explicit terminal state", () => {
  const report = buildProductConfigProgressLedgerFromRows({
    rows: [row(77, {
      duplicateCount: 2,
      canonicalDocumentId: 70,
      duplicateTypes: ["legacy", "file_hash"],
    })],
  });

  const item = ledgerById(report, 77);
  assert.equal(item.terminalState, "duplicate_reference");
  assert.deepEqual(item.duplicate.types, ["legacy", "file_hash"]);
  assert.equal(item.duplicate.canonicalDocumentId, 70);
});

test("dictionary dirty and explicit re-extraction status cannot pass as complete", () => {
  const report = buildProductConfigProgressLedgerFromRows({
    rows: [
      row(80, {
        hasBlocks: true,
        latestExtractionId: 80,
        latestExtractionStatus: "needs_reextract",
        latestExtractionPlanJson: { items: [{ item_index: 1 }] },
      }),
      row(81, {
        documentStatus: "dictionary_dirty",
        dictionaryDirty: true,
        hasBlocks: true,
        latestExtractionId: 81,
        latestNormalizedExtractionId: 81,
        latestNormalizedExtractionStatus: "normalized",
        latestNormalizedExtractionJson: fullItems,
        archiveCount: 1,
        archivedCount: 1,
        archiveExtractionResultIds: [81],
        latestArchiveId: 810,
        latestArchiveStatus: "archived",
        latestArchiveExtractionResultId: 81,
      }),
    ],
  });

  assert.equal(ledgerById(report, 80).terminalState, "needs_reextract");
  assert.equal(ledgerById(report, 81).terminalState, "normalized_partial");
  assert.ok(ledgerById(report, 81).blockerCodes.includes("dictionary_dirty"));
});

test("summary and bands count every document exactly once", () => {
  const report = buildProductConfigProgressLedgerFromRows({
    rows: [
      row(1),
      row(999),
      row(1000, { duplicateCount: 1, canonicalDocumentId: 1, duplicateTypes: ["legacy"] }),
      row(1001, { hasBlocks: true }),
      row(2001, { hasBlocks: true }),
    ],
  }, { bandSize: 1000 });

  assert.equal(report.summary.total, 5);
  assert.deepEqual(report.bands.map((band) => [band.startDocumentId, band.endDocumentId, band.total]), [
    [1, 1000, 3],
    [1001, 2000, 1],
    [2001, 3000, 1],
  ]);
  assert.equal(Object.values(report.summary.terminalCounts).reduce((sum, count) => sum + count, 0), 5);
  assert.equal(report.bands[0].terminalCounts.duplicate_reference, 1);
});
