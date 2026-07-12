import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { decideAdmission } from "../../goldenSet/fullReviewAdmission.js";
import { loadSealedFullReviewPackets, type ReviewSlot } from "../../goldenSet/fullReviewMerge.js";
import { FullReviewStore, type StoredReview } from "../../goldenSet/fullReviewStore.js";

const baselineDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review");
const storeFile = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review-annotations/store.json");
const exportDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EXPORT_DIR || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review-exports");
const user = (request: Request) => (request as Request & { userId?: string }).userId || "local-dev";

export async function fullReviewTasks(request: Request, response: Response) {
  const slot = callerSlot(request);
  const state = readStore();
  response.json({
    revision: state.revision,
    items: loadSealedFullReviewPackets(baselineDir()).map((packet) => ({
      ...redactPacket(packet),
      draft: state.drafts[key(slot, packet.document_id)] ?? null,
      submission: state.submitted[key(slot, packet.document_id)] ?? null,
    })),
  });
}

export async function saveFullReviewDraft(request: Request, response: Response) {
  response.json(store().draft(callerSlot(request), user(request), request.params.documentId, request.body?.revision, request.body?.annotation));
}

export async function submitFullReviewTask(request: Request, response: Response) {
  response.json(store().submit(callerSlot(request), user(request), request.params.documentId, request.body?.revision, request.body?.annotation));
}

export async function fullReviewAdjudications(_request: Request, response: Response) {
  const state = readStore();
  response.json({ revision: state.revision, items: loadSealedFullReviewPackets(baselineDir()).flatMap((packet) => {
    const a = state.submitted[key("annotator-a", packet.document_id)];
    const b = state.submitted[key("annotator-b", packet.document_id)];
    return a && b && JSON.stringify(a) !== JSON.stringify(b) ? [{ packet: redactPacket(packet), annotator_a: a, annotator_b: b, adjudication: state.adjudications[packet.document_id] ?? null }] : [];
  }) });
}

export async function submitFullReviewAdjudication(request: Request, response: Response) {
  response.json(store().adjudicate(user(request), request.params.documentId, request.body?.revision, request.body?.annotation));
}

export async function exportFullReviewAnnotations(_request: Request, response: Response) {
  response.json(store().exportSubmitted());
}

export async function previewFullReviewAdmission(request: Request, response: Response) {
  const documentId = typeof request.body?.documentId === "string" ? request.body.documentId.trim() : "";
  if (!documentId) { response.status(400).json({ error: "documentId is required" }); return; }
  const packet = loadSealedFullReviewPackets(baselineDir()).find((candidate) => candidate.document_id === documentId);
  if (!packet) { response.status(404).json({ error: "full review document not found" }); return; }
  const annotation = readStore().adjudications[documentId];
  if (!annotation) { response.status(409).json({ error: "document has no stored adjudication" }); return; }
  response.json(decideAdmission(annotation, packet, { thresholdsPassed: acceptanceThresholdsPassed() }));
}

function store() { return new FullReviewStore({ baselineDir: baselineDir(), storeFile: storeFile(), exportDir: exportDir() }); }
function key(slot: ReviewSlot, documentId: string) { return `${slot}:${documentId}`; }
function readStore(): StoredReview {
  return fs.existsSync(storeFile()) ? JSON.parse(fs.readFileSync(storeFile(), "utf8")) as StoredReview : { revision: 0, drafts: {}, submitted: {}, adjudications: {}, audit: [] };
}
function redactPacket<T extends { schema_version: string; document_id: string; cohort: string; evidence_hash: string; evidence: Array<{ evidence_id: string; content: string }> }>(packet: T) {
  return { schema_version: packet.schema_version, document_id: packet.document_id, cohort: packet.cohort, evidence_hash: packet.evidence_hash, evidence: packet.evidence };
}
function callerSlot(request: Request): ReviewSlot {
  const slot = (request as Request & { fullReviewSlot?: ReviewSlot }).fullReviewSlot;
  if (!slot) throw new Error("full review annotator slot was not resolved by authorization");
  return slot;
}

function acceptanceThresholdsPassed(): boolean | null {
  const file = process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EVALUATION_FILE;
  if (!file || !fs.existsSync(file)) return null;
  try {
    const evaluation = JSON.parse(fs.readFileSync(file, "utf8")) as { threshold_results?: { status?: string } };
    return evaluation.threshold_results?.status === "both_layers_passed" ? true
      : evaluation.threshold_results?.status === "failed" ? false : null;
  } catch { return null; }
}
