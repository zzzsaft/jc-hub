import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env", override: true });

const reviewedBy = "codex_doc0_100_dictionary_audit_20260708";
const rawValues = ["产量", "应用", "产品主体加热方式", "紧固件（螺丝）", "联接尺寸图纸提供情况", "出口使用", "国家", "备注/特殊要求"];

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { dictionaryGovernanceService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/governance.service.js");

try {
  const pending = await prisma.dictionaryCandidate.findMany({
    where: { status: "pending", termType: "unknown_field", rawValue: { in: rawValues } },
    orderBy: { id: "asc" },
  });
  const reviews = pending.map((candidate) => ({
    candidateId: Number(candidate.id),
    action: "reject",
    candidateType: "term_type",
  }));
  const result = reviews.length
    ? await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy })
    : { requestedCount: 0, successCount: 0, failedCount: 0, results: [] };
  const left = await prisma.dictionaryCandidate.findMany({
    where: { status: "pending", termType: "unknown_field", rawValue: { in: rawValues } },
    select: { id: true, rawValue: true, status: true },
    orderBy: { id: "asc" },
  });
  console.log(JSON.stringify(toJson({ reviews, result, left, businessLlmTokens: 0 }), null, 2));
} finally {
  await prisma.$disconnect();
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
}
