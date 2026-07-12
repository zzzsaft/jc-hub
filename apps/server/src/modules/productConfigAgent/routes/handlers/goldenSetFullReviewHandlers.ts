import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { decideAdmission } from "../../goldenSet/fullReviewAdmission.js";
import type { FullReviewAnnotation } from "../../goldenSet/fullReview.model.js";
import { loadSealedFullReviewPackets, type ReviewSlot } from "../../goldenSet/fullReviewMerge.js";
import { FullReviewStore, type StoredReview } from "../../goldenSet/fullReviewStore.js";

const baselineDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_BASELINE_DIR || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review");
const storeFile = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_STORE_FILE || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review-annotations/store.json");
const exportDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_V2_EXPORT_DIR || path.join(process.cwd(), "tmp/product-config-golden-set-v2-full-review-exports");
const user = (request: Request) => (request as Request & { userId?: string }).userId || "local-dev";

export async function fullReviewTasks(request: Request, response: Response) {
  const slot = callerSlot(user(request));
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
  response.json(store().draft(callerSlot(user(request)), user(request), request.params.documentId, request.body?.revision, request.body?.annotation));
}

export async function submitFullReviewTask(request: Request, response: Response) {
  response.json(store().submit(callerSlot(user(request)), user(request), request.params.documentId, request.body?.revision, request.body?.annotation));
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
  response.json(decideAdmission(request.body?.annotation as FullReviewAnnotation, {
    cohort: request.body?.cohort,
    thresholdsPassed: request.body?.thresholdsPassed === true,
  }));
}

function store() { return new FullReviewStore({ baselineDir: baselineDir(), storeFile: storeFile(), exportDir: exportDir() }); }
function key(slot: ReviewSlot, documentId: string) { return `${slot}:${documentId}`; }
function readStore(): StoredReview {
  return fs.existsSync(storeFile()) ? JSON.parse(fs.readFileSync(storeFile(), "utf8")) as StoredReview : { revision: 0, drafts: {}, submitted: {}, adjudications: {}, audit: [] };
}
function redactPacket<T extends { schema_version: string; document_id: string; cohort: string; evidence_hash: string; evidence: Array<{ evidence_id: string; content: string }> }>(packet: T) {
  return { schema_version: packet.schema_version, document_id: packet.document_id, cohort: packet.cohort, evidence_hash: packet.evidence_hash, evidence: packet.evidence };
}
function callerSlot(userId: string): ReviewSlot {
  const a = process.env.PRODUCT_CONFIG_GOLDEN_SET_ANNOTATOR_A_USER_ID;
  const b = process.env.PRODUCT_CONFIG_GOLDEN_SET_ANNOTATOR_B_USER_ID;
  if (userId === "local-dev" || userId === a) return "annotator-a";
  if (userId === b) return "annotator-b";
  throw new Error("full review annotator slot is not configured for caller");
}
