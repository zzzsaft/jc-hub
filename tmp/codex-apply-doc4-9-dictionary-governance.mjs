import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { dictionaryGovernanceService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/governance.service.js");

const reviewedBy = "codex_doc4_9_normalization_20260708";
const candidateIds = [
  3, 7, 9, 11, 17, 28, 47, 49, 679, 218, 219, 220, 683, 3856, 3857, 106, 107,
  5, 13, 20, 24, 29, 33, 34, 36, 40, 42, 44, 45, 46, 253, 270, 271, 274, 306, 315, 397, 396,
];

const reviews = [
  alias(3, "deckle_type", "external_hook_deckle"),
  alias(7, "flow_channel_type", "coat_hanger_manifold"),
  alias(9, "heating_method", "heating_rod"),
  alias(11, "wiring_method", "fully_enclosed_guarded_wiring"),
  alias(17, "product_material", "1.2311_Forged"),
  split(28, [{ termType: "feed_inlet_method", value: "中央方口进料" }, { termType: "feed_inlet_size", value: "按客户要求" }]),
  alias(47, "upper_lip_adjustment_method", "upper_manual_push_fine_adjustment_with_protection"),
  alias(49, "product_material", "1.2714_Forged"),
  split(679, [{ termType: "die_mounting_method", value: "45°斜挤出安装" }, { termType: "mounting_center_distance", value: "700mm" }]),
  createValue(218, "plastic_material", "WPC"),
  split(219, [
    { termType: "upper_lip_adjustment_method", value: "减力推拉式机械微调" },
    { termType: "lower_lip_adjustment_method", value: "可更换或固定" },
  ]),
  alias(220, "product_material", "3Cr13_Forged"),
  split(683, [{ qualifier: "特殊" }, { termType: "product_material", value: "3Cr13钢材" }]),
  createValue(3856, "application", "自由发泡板"),
  split(3857, [{ qualifier: "其他" }, { termType: "product_material", value: "3Cr13钢材" }]),
  alias(106, "metering_pump_model", "GD-E45"),
  alias(107, "heating_method", "heating_rod"),
  ...[5, 13, 20, 24, 29, 33, 34, 36, 40, 42, 44, 45, 46, 253, 270, 271, 274, 306, 315, 397, 396].map((candidateId) => ({
    candidateId,
    action: "reject",
    candidateType: "value",
  })),
];

const before = await snapshot();
fs.writeFileSync("tmp/codex-doc4-9-dictionary-governance-before.json", JSON.stringify(toJson(before), null, 2));

const result = await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy });
const after = await snapshot();
const report = { reviewedBy, result, beforeCounts: counts(before), afterCounts: counts(after) };

fs.writeFileSync("tmp/codex-doc4-9-dictionary-governance-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson(report), null, 2));

await prisma.$disconnect();

function alias(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "approve-as-alias", candidateType: "value", targetTermType, canonicalValue };
}

function createValue(candidateId, targetTermType, canonicalValue) {
  return { candidateId, action: "create-value", candidateType: "value", targetTermType, canonicalValue };
}

function split(candidateId, parts) {
  return { candidateId, action: "split", candidateType: "value", parts };
}

async function snapshot() {
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: candidateIds.map(BigInt) } },
    orderBy: { id: "asc" },
  });
  const terms = await prisma.dictionaryTerm.findMany({
    where: {
      OR: reviews
        .filter((item) => item.canonicalValue)
        .map((item) => ({ termType: item.targetTermType, canonicalValue: item.canonicalValue })),
    },
    orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
  });
  const aliases = await prisma.dictionaryAlias.findMany({
    where: { aliasValue: { in: candidates.map((item) => item.rawValue) } },
    orderBy: [{ termType: "asc" }, { aliasValue: "asc" }],
  });
  const splits = await prisma.dictionarySplit.findMany({
    where: {
      OR: candidates.map((item) => ({ termType: item.termType, sourceValue: item.rawValue })),
    },
    orderBy: [{ termType: "asc" }, { sourceValue: "asc" }],
  });
  const version = await prisma.dictionaryVersion.findUnique({ where: { versionKey: "default" } });
  const documents = await prisma.productDocument.findMany({
    where: { id: { in: [4n, 6n, 7n, 8n, 9n] } },
    select: { id: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  return { candidates, terms, aliases, splits, version, documents };
}

function counts(snapshotValue) {
  return Object.fromEntries(Object.entries(snapshotValue).map(([key, value]) => [key, Array.isArray(value) ? value.length : Number(Boolean(value))]));
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
