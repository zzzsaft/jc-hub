import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/build/lib/prisma.js");

const reviewedBy = "codex_doc4_9_normalization_20260708";
const splits = [
  split(28, "feed_inlet_method", "中央方口进料**按客户要求的进料口尺寸***", [
    { termType: "feed_inlet_method", value: "中央方口进料" },
    { termType: "feed_inlet_size", value: "按客户要求" },
  ]),
  split(679, "die_mounting_method", "45°斜挤出安装（中心距700mm）", [
    { termType: "die_mounting_method", value: "45°斜挤出安装" },
    { termType: "mounting_center_distance", value: "700mm" },
  ]),
  split(219, "upper_lip_adjustment_method", "上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°）", [
    { termType: "upper_lip_adjustment_method", value: "减力推拉式机械微调" },
    { termType: "lower_lip_adjustment_method", value: "可更换或固定" },
  ]),
  split(683, "product_material", "特殊 3Cr13钢材", [
    { qualifier: "特殊" },
    { termType: "product_material", value: "3Cr13钢材" },
  ]),
  split(3857, "product_material", "其他 3Cr13钢材", [
    { qualifier: "其他" },
    { termType: "product_material", value: "3Cr13钢材" },
  ]),
];

const before = await snapshot();
const changed = [];

for (const item of splits) {
  const existing = await prisma.dictionarySplit.findFirst({
    where: { termType: item.termType, sourceValue: item.sourceValue },
  });
  const data = {
    termType: item.termType,
    sourceValue: item.sourceValue,
    partsJson: item.parts,
    status: "approved",
    metadata: { reviewedBy, candidateId: item.candidateId },
  };
  const row = existing
    ? await prisma.dictionarySplit.update({ where: { id: existing.id }, data })
    : await prisma.dictionarySplit.create({ data });
  const candidate = await prisma.dictionaryCandidate.update({
    where: { id: BigInt(item.candidateId) },
    data: { status: "split", reviewedBy, reviewedAt: new Date() },
  });
  changed.push({ split: row, candidate });
}

const version = await prisma.dictionaryVersion.upsert({
  where: { versionKey: "default" },
  create: { versionKey: "default", versionValue: 1, description: "ProductConfigAgent dictionary" },
  update: { versionValue: { increment: 1 } },
});
await prisma.$executeRaw`
  insert into production_config_agent.dictionary_change_logs
    (dictionary_version, source, action, candidate_type, before_jsonb, after_jsonb, changed_by,
     entity_type, version_value, version_key, entity_id, before_json, after_json, created_by)
  values
    (${version.versionValue}, 'codex', 'complete_split_governance', 'value',
     ${JSON.stringify(toJson(before))}::jsonb, ${JSON.stringify(toJson(changed))}::jsonb, ${reviewedBy},
     'candidate', ${version.versionValue}, 'default', 'doc4_9_split_batch',
     ${JSON.stringify(toJson(before))}::jsonb, ${JSON.stringify(toJson(changed))}::jsonb, ${reviewedBy})
`;

const after = await snapshot();
const report = { reviewedBy, version: String(version.versionValue), before, changed, after };
fs.writeFileSync("tmp/codex-doc4-9-split-governance-result.json", JSON.stringify(toJson(report), null, 2));
console.log(JSON.stringify(toJson({ version: report.version, changedCount: changed.length, after: after.candidates }), null, 2));
await prisma.$disconnect();

function split(candidateId, termType, sourceValue, parts) {
  return { candidateId, termType, sourceValue, parts };
}

async function snapshot() {
  const candidates = await prisma.dictionaryCandidate.findMany({
    where: { id: { in: splits.map((item) => BigInt(item.candidateId)) } },
    select: { id: true, termType: true, rawValue: true, status: true, reviewedBy: true, reviewedAt: true },
    orderBy: { id: "asc" },
  });
  const splitRows = await prisma.dictionarySplit.findMany({
    where: { OR: splits.map((item) => ({ termType: item.termType, sourceValue: item.sourceValue })) },
    orderBy: [{ termType: "asc" }, { sourceValue: "asc" }],
  });
  return { candidates, splitRows };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}
