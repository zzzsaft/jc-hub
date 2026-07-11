import type { Request, Response } from "express";
import { annotationWorkbench } from "../../goldenSet/annotationWorkbench.js";
const layer = (v: unknown) => v === "erp_identity" ? "erp_identity" as const : "product_package" as const;
const user = (r: Request) => (r as Request & { userId?: string }).userId || "local-dev";
export async function goldenTasks(r: Request, s: Response) { s.json(annotationWorkbench.list(user(r), layer(r.query.layer), Number(r.query.page) || 1, Math.min(Number(r.query.pageSize) || 20, 100))); }
export async function goldenTask(r: Request, s: Response) { const sampleId = typeof r.params.sampleId === "string" && r.params.sampleId !== "next" ? r.params.sampleId : undefined; s.json(annotationWorkbench.next(user(r), layer(r.query.layer), sampleId)); }
export async function saveGoldenDraft(r: Request, s: Response) { s.json(annotationWorkbench.draft(user(r), layer(r.body?.layer), r.params.sampleId, r.body)); }
export async function submitGoldenTask(r: Request, s: Response) { s.json(annotationWorkbench.submit(user(r), layer(r.body?.layer), r.params.sampleId, r.body)); }
export async function goldenAdjudicationQueue(_r: Request, s: Response) { s.json({ items: annotationWorkbench.adjudicationQueue() }); }
export async function submitGoldenAdjudication(r: Request, s: Response) { s.json(annotationWorkbench.adjudicate(user(r), layer(r.body?.layer), r.params.sampleId, r.body?.gold)); }
export async function exportGoldenAnnotations(_r: Request, s: Response) { s.json(annotationWorkbench.exportAdjudicated()); }
