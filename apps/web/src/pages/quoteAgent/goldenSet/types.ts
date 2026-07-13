export type GoldenLayer = "product_package" | "erp_identity";
export type GoldenTask = { sample_id: string; layer: GoldenLayer; strata: Record<string, unknown>; selection_reasons: string[]; evidence: { evidence_id: string; source: Record<string, unknown>; blocks: Array<{ evidence_id: string; section: string; text: string }>; note: string }; annotation: unknown; revision: number };
