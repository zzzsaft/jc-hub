import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc0_100_dictionary_audit_20260708";
const mappings = new Map([
  ["产量", "capacity"],
  ["应用", "application"],
  ["产品主体加热方式", "heating_method"],
  ["紧固件（螺丝）", "screw_type"],
  ["联接尺寸图纸提供情况", "connection_drawing_status"],
  ["出口使用", "usage_market"],
  ["国家", "country"],
  ["备注/特殊要求", "marking_requirement_note"],
]);

const { prisma } = await import("../apps/server/build/lib/prisma.js");
const { dictionaryGovernanceService } = await import("../apps/server/build/modules/productConfigAgent/dictionary/governance.service.js");
const { productConfigAgentService } = await import("../apps/server/build/modules/productConfigAgent/service.js");

const startedAt = new Date();

try {
  const pending = await prisma.dictionaryCandidate.findMany({
    where: {
      status: "pending",
      termType: "unknown_field",
      rawValue: { in: [...mappings.keys()] },
    },
    orderBy: { id: "asc" },
  });
  const reviews = pending.map((candidate) => ({
    candidateId: Number(candidate.id),
    action: "approve-as-alias",
    candidateType: "term_type",
    targetTermType: mappings.get(candidate.rawValue),
  }));
  const governanceResult = reviews.length
    ? await dictionaryGovernanceService.reviewCandidatesBatch({ reviews, reviewedBy })
    : { requestedCount: 0, successCount: 0, failedCount: 0, affectedDocumentIds: [] };

  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { gte: 0n, lte: 100n }, dictionaryDirty: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const refreshRuns = [];
  for (const row of dirtyDocs) {
    const documentId = Number(row.id);
    process.stdout.write(`refresh ${documentId} ... `);
    const result = await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy });
    console.log(result.failedCount === 0 ? "ok" : `failed ${result.failedCount}`);
    refreshRuns.push({ documentId, result });
  }
  const checks = await runChecks(startedAt);
  const report = { reviewedBy, pendingBefore: pending, reviews, governanceResult, refreshRuns, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc0-100-regenerated-termtype-candidate-repair.json", JSON.stringify(toJson(report), null, 2));
  console.log(JSON.stringify(toJson({
    reviewed: governanceResult,
    refreshed: refreshRuns.map((item) => ({ documentId: item.documentId, failedCount: item.result.failedCount })),
    checks,
    output: "tmp/codex-doc0-100-regenerated-termtype-candidate-repair.json",
    businessLlmTokens: 0,
  }), null, 2));
} finally {
  await prisma.$disconnect();
}

async function runChecks(since) {
  const pending = await prisma.dictionaryCandidate.findMany({
    where: { status: "pending", termType: "unknown_field", rawValue: { in: [...mappings.keys()] } },
    select: { id: true, termType: true, rawValue: true, status: true },
    orderBy: { id: "asc" },
  });
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { gte: 0n, lte: 100n }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { gte: 0n, lte: 100n }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: since } } }).catch(() => null);
  return { pending, dirtyDocs, dirtyArchives, llmCallsSinceStart };
}

function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
}
