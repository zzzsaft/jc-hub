import fs from "node:fs";
import path from "node:path";
import { sha256File, type ErpPacket, type PackagePacket } from "./model.js";

type Seal = { artifacts: Record<string, { sha256: string; bytes: number }> };

export function verifyEvaluationBaseline(baselineDir: string, packages: PackagePacket[], erp: ErpPacket[]) {
  const sealPath = path.join(baselineDir, "artifact-seal.json");
  if (!fs.existsSync(sealPath)) throw new Error(`Baseline drift: missing artifact seal ${sealPath}`);
  const seal = JSON.parse(fs.readFileSync(sealPath, "utf8")) as Seal;
  const errors: string[] = [];
  for (const [name, expected] of Object.entries(seal.artifacts ?? {})) {
    const file = path.join(baselineDir, name);
    if (!fs.existsSync(file)) { errors.push(`artifact missing: ${name}`); continue; }
    const bytes = fs.statSync(file).size;
    const hash = sha256File(file);
    if (bytes !== expected.bytes || hash !== expected.sha256) errors.push(`artifact hash drift: ${name}`);
  }
  if (errors.length) throw new Error(`Baseline drift:\n${errors.join("\n")}`);
  const baselinePackages = readPackets<PackagePacket>(baselineDir, "product-package-annotation-packets.json");
  const baselineErp = readPackets<ErpPacket>(baselineDir, "erp-identity-annotation-packets.json");
  compareImmutable("product_package", baselinePackages, packages, errors);
  compareImmutable("erp_identity", baselineErp, erp, errors);
  if (errors.length) throw new Error(`Baseline drift:\n${errors.join("\n")}`);
  return { passed: true, baseline_dir: baselineDir, sealed_artifacts: Object.keys(seal.artifacts).length };
}

function readPackets<T>(dir: string, name: string): T[] {
  return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T[];
}

function compareImmutable(layer: string, baseline: Array<Record<string, unknown>>, candidate: Array<Record<string, unknown>>, errors: string[]) {
  const baseIds = new Set(baseline.map((packet) => String(packet.sample_id)));
  const candidateIds = new Set(candidate.map((packet) => String(packet.sample_id)));
  if (candidateIds.size !== candidate.length) errors.push(`${layer}: duplicate sample_id in evaluation file`);
  for (const id of baseIds) if (!candidateIds.has(id)) errors.push(`${layer}: sample missing ${id}`);
  for (const id of candidateIds) if (!baseIds.has(id)) errors.push(`${layer}: unexpected sample ${id}`);
  const byId = new Map(candidate.map((packet) => [String(packet.sample_id), packet]));
  for (const source of baseline) {
    const target = byId.get(String(source.sample_id));
    if (!target) continue;
    for (const field of ["sample_id", "layer", "source", "strata", "selection_reasons", "prediction"]) {
      if (stableJson(source[field]) !== stableJson(target[field])) errors.push(`${layer}:${source.sample_id}: immutable ${field} changed`);
    }
  }
}

function stableJson(value: unknown) { return JSON.stringify(value); }
