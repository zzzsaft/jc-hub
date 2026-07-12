import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { ProductConfigErpIdentityLookupService } from "../erpIdentityLookup.service.js";
import { buildFullReviewSnapshot, assertV2OutputDirWritable, createErpCandidateEvidenceCircuit, verifyV1ArtifactSeal, type DerivedEvidence } from "../goldenSet/fullReviewSnapshot.js";
import { sha256File } from "../goldenSet/model.js";
import { collectProductEvidence } from "../productType/discovery.js";

const V1_DIR = "/Users/zzzsaft/.codex/worktrees/6054/jc-hub/tmp/product-config-golden-set-v1";

async function main() {
  const outDir = parseOutDir(process.argv.slice(2));
  verifyV1ArtifactSeal(V1_DIR);
  assertV2OutputDirWritable(outDir);
  const source = JSON.parse(fs.readFileSync(path.join(V1_DIR, "source-metadata.json"), "utf8")) as { documents?: Array<{ document_id?: unknown }> };
  const ids = source.documents?.map((document) => String(document.document_id ?? "").trim()) ?? [];
  if (ids.length !== 400 || new Set(ids).size !== 400 || ids.some((id) => !id)) throw new Error(`Expected 400 unique source-metadata document IDs, got ${new Set(ids).size}`);
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? "/Users/zzzsaft/Documents/jc-hub/.env" });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for read-only evidence loading");
  const erpLookupTimeoutMs = positiveInteger(process.env.FULL_REVIEW_ERP_LOOKUP_TIMEOUT_MS, 5_000);
  const prisma = new PrismaClient();
  try {
    const blockRows = await prisma.documentBlock.findMany({ where: { documentId: { in: ids.map(BigInt) } }, select: { documentId: true, blocksJson: true }, orderBy: { documentId: "asc" } });
    const blocks = blockRows.map((row) => ({ document_id: String(row.documentId), blocks_json: row.blocksJson }));
    console.log(`stage=document_blocks processed=${blocks.length}/${ids.length} success=${blocks.length} failed=${ids.length - blocks.length}`);
    const candidates = await deriveCandidates(ids, blocks, erpLookupTimeoutMs);
    const snapshot = buildFullReviewSnapshot(ids, blocks, candidates, "full-review-v2-2026-07-12");
    const calibration = snapshot.packets.filter((packet) => packet.cohort === "calibration").length;
    if (snapshot.packets.length !== 400 || calibration !== 280) throw new Error("Invalid full-review cohort split");
    fs.mkdirSync(outDir, { recursive: true });
    const packetsFile = path.join(outDir, "packets.json");
    const manifestFile = path.join(outDir, "manifest.json");
    fs.writeFileSync(packetsFile, json(snapshot.packets));
    fs.writeFileSync(manifestFile, json({ schema_version: "product-config-golden-full-review-manifest-v2", immutable: true, seed: snapshot.seed, documents: 400, calibration, acceptance: 120, safeguards: { database_writes: 0, erp_writes: 0, archive_writes: 0, workers_started: 0, business_llm_calls: 0 } }));
    fs.writeFileSync(path.join(outDir, "artifact-seal.json"), json({ schema_version: "product-config-golden-artifact-seal-v1", immutable: true, artifacts: Object.fromEntries([packetsFile, manifestFile].map((file) => [path.basename(file), { sha256: sha256File(file), bytes: fs.statSync(file).size }])) }));
    console.log("stage=done documents=400 calibration=280 acceptance=120");
  } finally {
    await prisma.$disconnect();
  }
}

async function deriveCandidates(ids: string[], blocks: Array<{ document_id: string; blocks_json: unknown }>, erpLookupTimeoutMs: number) {
  const blocksById = new Map(blocks.map((row) => [row.document_id, row]));
  const erp = new ProductConfigErpIdentityLookupService();
  const erpCircuit = createErpCandidateEvidenceCircuit(erpLookupTimeoutMs);
  const result = new Map<string, DerivedEvidence>();
  const failures: string[] = [];
  for (const [index, documentId] of ids.entries()) {
    try {
      const block = blocksById.get(documentId);
      if (!block) throw new Error("missing document block");
      const packageCandidates = collectProductEvidence({
        documentId: BigInt(documentId), fileName: null, blocksJson: block.blocks_json,
        planJson: {}, extractionJson: {}, normalizedExtractionJson: {},
      }).map((candidate) => ({ source: candidate.source, value: candidate.raw }));
      const erpEvidence = await erpCircuit.resolve(documentId, async () =>
          (await erp.linkPackage({ items: packageCandidates.map((candidate, index) => ({ itemKey: `${documentId}:${index}`, productName: candidate.value })), limit: 3 })).candidates.map((candidate) => ({
            company: candidate.company, part_num: candidate.productNumber, product_name: candidate.productName,
            prod_code: candidate.prodCode, class_id: candidate.classId, has_bom: candidate.hasBom, clues: candidate.clues,
          })));
      result.set(documentId, {
        package: { evidence_id: `package-candidates:${documentId}`, content: JSON.stringify(packageCandidates) },
        erp: erpEvidence,
      });
    } catch (error) {
      failures.push(`${documentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(`stage=candidates processed=${index + 1}/${ids.length} success=${result.size} failed=${failures.length}`);
  }
  if (failures.length) throw new Error(`Candidate derivation failed: ${failures.join("; ")}`);
  return result;
}

function parseOutDir(args: string[]) {
  if (args.some((value) => value === "--apply" || !value.startsWith("--out-dir="))) throw new Error("Only --out-dir is supported; this builder is read-only");
  return args.find((value) => value.startsWith("--out-dir="))?.slice(10) ?? "tmp/product-config-golden-set-v2-full-review";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function json(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
