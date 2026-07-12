import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { buildFullReviewSnapshot } from "../goldenSet/fullReviewSnapshot.js";
import { sha256File } from "../goldenSet/model.js";

const V1_DIR = "/Users/zzzsaft/.codex/worktrees/6054/jc-hub/tmp/product-config-golden-set-v1";

async function main() {
  const outDir = process.argv.slice(2).find((value) => value.startsWith("--out-dir="))?.slice(10) ?? "tmp/product-config-golden-set-v2-full-review";
  if (process.argv.slice(2).some((value) => value === "--apply" || !value.startsWith("--out-dir="))) throw new Error("Only --out-dir is supported; this builder is read-only");
  const v1Packets = ["product-package-annotation-packets.json", "erp-identity-annotation-packets.json"]
    .flatMap((name) => JSON.parse(fs.readFileSync(path.join(V1_DIR, name), "utf8")));
  const ids = [...new Set(v1Packets.map((packet: any) => String(packet.source?.document_id ?? "")))];
  if (ids.length !== 400) throw new Error(`Expected 400 unique v1 document IDs, got ${ids.length}`);
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? "/Users/zzzsaft/Documents/jc-hub/.env" });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for read-only document blocks");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.documentBlock.findMany({
      where: { documentId: { in: ids.map(BigInt) } },
      select: { documentId: true, blocksJson: true },
      orderBy: { documentId: "asc" },
    });
    const blocks = rows.map((row) => ({ document_id: String(row.documentId), blocks_json: row.blocksJson }));
    console.log(`stage=document_blocks processed=${blocks.length}/${ids.length} success=${blocks.length} failed=${ids.length - blocks.length}`);
    const snapshot = buildFullReviewSnapshot(v1Packets, blocks, "full-review-v2-2026-07-12");
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

function json(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
