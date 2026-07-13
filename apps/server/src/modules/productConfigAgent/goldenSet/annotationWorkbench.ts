import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../../../lib/errors.js";
import { verifyEvaluationBaseline } from "./baseline.js";
import type { ErpPacket, PackagePacket } from "./model.js";
import { productConfigErpIdentityLookupService } from "../erpIdentityLookup.service.js";

const baselineDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_BASELINE_DIR || "/Users/zzzsaft/.codex/worktrees/6054/jc-hub/tmp/product-config-golden-set-v1";
const storeDir = () => process.env.PRODUCT_CONFIG_GOLDEN_SET_ANNOTATION_DIR || path.join(process.cwd(), "tmp/product-config-golden-set-v1-annotations");
const packetFile = (layer: string) => path.join(baselineDir(), layer === "product_package" ? "product-package-annotation-packets.json" : "erp-identity-annotation-packets.json");
type Layer = "product_package" | "erp_identity";
type Slot = "annotator_a" | "annotator_b";
type Stored = { revision: number; drafts: Record<string, unknown>; submitted: Record<string, unknown>; adjudications: Record<string, unknown>; audit: Array<Record<string, unknown>> };

function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
function atomicWrite(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, file); }
function readStore(): Stored { const file = path.join(storeDir(), "store.json"); return fs.existsSync(file) ? readJson<Stored>(file) : { revision: 0, drafts: {}, submitted: {}, adjudications: {}, audit: [] }; }
function writeStore(store: Stored) { atomicWrite(path.join(storeDir(), "store.json"), store); }
function packets(layer: Layer) { return readJson<Array<PackagePacket | ErpPacket>>(packetFile(layer)); }
function key(layer: Layer, sampleId: string, slot?: Slot) { return [layer, sampleId, slot].filter(Boolean).join(":"); }
function userSlot(userId: string): Slot { const a = String(process.env.PRODUCT_CONFIG_GOLDEN_SET_ANNOTATOR_A_IDS || "").split(",").map(v => v.trim()).filter(Boolean); const b = String(process.env.PRODUCT_CONFIG_GOLDEN_SET_ANNOTATOR_B_IDS || "").split(",").map(v => v.trim()).filter(Boolean); if (a.includes(userId)) return "annotator_a"; if (b.includes(userId)) return "annotator_b"; if (process.env.NODE_ENV !== "production") return userId.toLowerCase().includes("b") ? "annotator_b" : "annotator_a"; throw new AppError(403, "当前用户未分配标注席位"); }
function blind(packet: PackagePacket | ErpPacket, store: Stored, slot: Slot) {
  const evidence = evidenceFor(packet); const own = store.submitted[key(packet.layer, packet.sample_id, slot)] || store.drafts[key(packet.layer, packet.sample_id, slot)] || null;
  return { sample_id: packet.sample_id, layer: packet.layer, strata: packet.strata, selection_reasons: packet.selection_reasons, evidence, annotation: own, revision: store.revision };
}
function evidenceFor(packet: PackagePacket | ErpPacket) {
  const source = packet.source as Record<string, unknown>;
  const safe = Object.fromEntries(Object.entries(source).filter(([k]) => !/file|customer|contact|phone|address|price/i.test(k)));
  const blocks = [{ evidence_id: `source:${packet.sample_id}`, section: "原表局部结构摘要", text: `来源文档 ${String(source.document_id ?? "")}; ${Object.entries(safe).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${String(v)}`).join("；")}` }];
  return { evidence_id: `evidence:${packet.sample_id}`, source: safe, blocks, note: "仅供人工判断；系统结果、候选排序和另一位标注员答案均不可见。" };
}
function assertPacket(layer: Layer, sampleId: string) { const packet = packets(layer).find(v => v.sample_id === sampleId); if (!packet) throw new AppError(404, "任务不存在"); return packet; }
function mutate(userId: string, layer: Layer, sampleId: string, body: { revision: number; annotation: unknown }, submit: boolean) {
  const slot = userSlot(userId); const store = readStore(); const packet = assertPacket(layer, sampleId); const submittedKey = key(layer, sampleId, slot);
  if (store.revision !== body.revision) throw new AppError(409, "内容已更新，请刷新后重试");
  if (store.submitted[submittedKey]) throw new AppError(409, "该任务已提交，不能覆盖");
  store[submit ? "submitted" : "drafts"][submittedKey] = body.annotation; store.revision += 1;
  store.audit.push({ at: new Date().toISOString(), action: submit ? "submit" : "draft", user_id: userId, layer, sample_id: sampleId, slot, revision: store.revision }); writeStore(store);
  return blind(packet, store, slot);
}

export const annotationWorkbench = {
  list(userId: string, layer: Layer, page = 1, pageSize = 20) { const slot = userSlot(userId); const store = readStore(); const all = packets(layer); const status = (p: PackagePacket | ErpPacket) => store.submitted[key(layer, p.sample_id, slot)] ? "已提交" : store.drafts[key(layer, p.sample_id, slot)] ? "草稿" : "待处理"; const items = all.slice((page - 1) * pageSize, page * pageSize).map(p => ({ sample_id: p.sample_id, status: status(p), strata: p.strata })); return { items, page, pageSize, total: all.length, progress: { total: all.length, submitted: all.filter(p => status(p) === "已提交").length } }; },
  next(userId: string, layer: Layer, sampleId?: string) { const slot = userSlot(userId); const store = readStore(); const all = packets(layer); const packet = sampleId ? assertPacket(layer, sampleId) : all.find(p => !store.submitted[key(layer, p.sample_id, slot)]) || all[0]; return blind(packet, store, slot); },
  draft(userId: string, layer: Layer, sampleId: string, body: { revision: number; annotation: unknown }) { return mutate(userId, layer, sampleId, body, false); },
  submit(userId: string, layer: Layer, sampleId: string, body: { revision: number; annotation: unknown }) { return mutate(userId, layer, sampleId, body, true); },
  adjudicationQueue() { const store = readStore(); return (["product_package", "erp_identity"] as Layer[]).flatMap(layer => packets(layer).filter(p => { const a = store.submitted[key(layer,p.sample_id,"annotator_a")]; const b = store.submitted[key(layer,p.sample_id,"annotator_b")]; return a && b && JSON.stringify(a) !== JSON.stringify(b) && !store.adjudications[key(layer,p.sample_id)]; }).map(p => ({ sample_id: p.sample_id, layer, annotator_a: store.submitted[key(layer,p.sample_id,"annotator_a")], annotator_b: store.submitted[key(layer,p.sample_id,"annotator_b")], evidence: evidenceFor(p) }))); },
  async searchErp(query: string, page = 1, pageSize = 20) { const limit = Math.min(100, Math.max(1, page * pageSize)); const result = await productConfigErpIdentityLookupService.lookup({ itemText: query, limit }); const items = result.candidates.slice((page - 1) * pageSize, page * pageSize).map(v => ({ company: v.company, part_num: v.productNumber, product_name: v.productName, prod_code: v.prodCode, has_bom: v.hasBom, evidence_id: `erp-search:${v.company}:${v.productNumber}` })); return { items, page, pageSize, total: result.candidates.length, hasMore: result.truncated || result.candidates.length >= limit }; },
  adjudicate(userId: string, layer: Layer, sampleId: string, result: unknown) { const store = readStore(); if (!store.submitted[key(layer,sampleId,"annotator_a")] || !store.submitted[key(layer,sampleId,"annotator_b")]) throw new AppError(409, "需等待两位标注员均提交"); store.adjudications[key(layer,sampleId)] = result; store.revision++; store.audit.push({ at: new Date().toISOString(), action: "adjudicate", user_id: userId, layer, sample_id: sampleId, revision: store.revision }); writeStore(store); return { ok: true, revision: store.revision }; },
  exportAdjudicated() { const store = readStore(); const build = (layer: Layer) => packets(layer).map(p => ({ ...p, annotation_status: store.adjudications[key(layer,p.sample_id)] ? "adjudicated" : p.annotation_status, annotations: { annotator_a: store.submitted[key(layer,p.sample_id,"annotator_a")] || null, annotator_b: store.submitted[key(layer,p.sample_id,"annotator_b")] || null, adjudication: store.adjudications[key(layer,p.sample_id)] || null }, gold: store.adjudications[key(layer,p.sample_id)] || null })); const packages = build("product_package") as PackagePacket[]; const erp = build("erp_identity") as ErpPacket[]; verifyEvaluationBaseline(baselineDir(), packages, erp); return { packages, erp }; },
};
