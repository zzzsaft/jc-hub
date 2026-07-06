import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDuplicateDocumentReport,
  calculateDocumentContentHash,
  chooseCanonicalDocument,
} from "../../src/productConfigAgent/workflow/documentDuplicateAnalysis.js";

test("calculateDocumentContentHash prefers llm_text", () => {
  assert.equal(
    calculateDocumentContentHash({ llm_text: "A\r\nB" }),
    calculateDocumentContentHash({ llm_text: "A\nB" }),
  );
});

test("chooseCanonicalDocument prefers normalized extraction then lower id", () => {
  const canonical = chooseCanonicalDocument([
    { documentId: 3, fileHash: "a", latestExtractionStatus: null },
    { documentId: 2, fileHash: "a", latestExtractionStatus: "normalized" },
    { documentId: 1, fileHash: "a", latestExtractionStatus: "normalized" },
  ]);
  assert.equal(canonical.documentId, 1);
});

test("buildDuplicateDocumentReport groups same filename and content", () => {
  const report = buildDuplicateDocumentReport([
    { documentId: 1, fileName: "a.xlsx", fileHash: "h1", blocksId: 1, blocksJson: { llm_text: "same" } },
    { documentId: 2, fileName: "a.xlsx", fileHash: "h2", blocksId: 2, blocksJson: { llm_text: "same" } },
    { documentId: 3, fileName: "b.xlsx", fileHash: "h3", blocksId: 3, blocksJson: { llm_text: "same" } },
  ]);
  assert.equal(report.length, 1);
  assert.equal(report[0].canonicalDocumentId, 1);
  assert.equal(report[0].duplicateMappings[0].duplicateDocumentId, 2);
});
