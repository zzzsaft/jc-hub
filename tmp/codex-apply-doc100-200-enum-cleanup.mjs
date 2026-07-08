import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc100_200_enum_cleanup_20260708";
const docs = Array.from({ length: 101 }, (_, index) => index + 100);
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentRepository } = await import("../apps/server/src/modules/productConfigAgent/db.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeAlias, dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");

const startedAt = new Date();

const createValues = [
  ["application", "石塑地板"],
  ["application", "中空格子板材"],
  ["application", "编织袋拉丝"],
  ["feed_inlet_method", "侧面圆口进料"],
  ["thickness_gauge_operation_mode", "单阀"],
  ["thickness_gauge_operation_mode", "双阀"],
  ["thickness_gauge_operation_mode", "电磁阀"],
  ["filter_drive_method", "手动"],
  ["hydraulic_valve_sharing_mode", "三阀共享"],
  ["connector_type", "换网器用连接器"],
  ["connector_type", "计量泵用连接器"],
];

const aliasesToExisting = [
  ["application", "仿结皮发泡板", "仿结皮发泡"],
  ["application", "超高分子", "超高分子量"],
  ["feedblock_structure", "pendulum_blade", "摆叶"],
  ["hydraulic_valve_type", "exhaust_double_valve", "排气双阀"],
  ["precision_grade", "optical_grade", "按光学级别标准"],
];

try {
  const before = await snapshot();
  const valueResults = [];
  for (const [termType, canonicalValue] of createValues) {
    valueResults.push({
      action: "create_or_update_value",
      termType,
      canonicalValue,
      row: await productConfigAgentRepository.upsertValue({ termType, canonicalValue, displayName: canonicalValue }),
    });
  }

  const aliasResults = [];
  for (const [termType, canonicalValue, aliasValue] of aliasesToExisting) {
    const term = await prisma.dictionaryTerm.findUnique({ where: { termType_canonicalValue: { termType, canonicalValue } } });
    if (!term) throw new Error(`Missing canonical term ${termType}:${canonicalValue}`);
    aliasResults.push(await upsertValueAlias(term.id, termType, aliasValue));
  }

  dictionaryMatcherService.invalidate();

  const refreshRuns = [];
  for (const documentId of docs) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }

  const checks = await runChecks();
  const report = { reviewedBy, startedAt, before, valueResults, aliasResults, refreshRuns, checks, businessLlmTokens: 0 };
  fs.writeFileSync("tmp/codex-doc100-200-enum-cleanup-result.json", json(report));
  console.log(json({
    valueCount: valueResults.length,
    aliasCount: aliasResults.length,
    refresh: {
      requestedCount: refreshRuns.length,
      successCount: refreshRuns.filter((item) => item.result.failedCount === 0).length,
      failed: refreshRuns.filter((item) => item.result.failedCount > 0).map((item) => ({ documentId: item.documentId, result: item.result })),
    },
    checks: summarizeChecks(checks),
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}

async function upsertValueAlias(termId, termType, aliasValue) {
  const before = await prisma.dictionaryAlias.findUnique({
    where: { termType_normalizedAlias: { termType, normalizedAlias: normalizeAlias(aliasValue) } },
  });
  const row = await prisma.dictionaryAlias.upsert({
    where: { termType_normalizedAlias: { termType, normalizedAlias: normalizeAlias(aliasValue) } },
    create: {
      termId,
      termType,
      aliasValue,
      normalizedAlias: normalizeAlias(aliasValue),
      source: reviewedBy,
      isActive: true,
    },
    update: {
      termId,
      aliasValue,
      source: reviewedBy,
      isActive: true,
    },
  });
  await productConfigAgentRepository.bumpDictionaryVersion("upsert_value_alias", "value_alias", String(row.id), row, before, reviewedBy);
  return row;
}

async function snapshot() {
  return {
    generatedAt: new Date().toISOString(),
    latestExtractions: await prisma.extractionResult.findMany({
      where: { documentId: { in: docs.map(BigInt) } },
      select: { id: true, documentId: true, llmModel: true, promptVersion: true, createdAt: true },
      orderBy: [{ documentId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    archives: await prisma.contractArchive.findMany({
      where: { documentId: { in: docs.map(BigInt) } },
      select: { id: true, documentId: true, extractionResultId: true, dirtyReason: true, status: true },
      orderBy: [{ documentId: "asc" }, { id: "asc" }],
    }),
  };
}

async function runChecks() {
  const duplicateArchives = await prisma.$queryRawUnsafe(`
    select document_id, count(*)::int as count
    from production_config_agent.contract_archives
    where document_id is not null
    group by document_id
    having count(*) > 1
    order by document_id
  `);
  const indexRows = await prisma.$queryRawUnsafe(`
    select indexname
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: docs.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, dictionaryDirty: true },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: docs.map(BigInt) }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true },
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { in: docs.map(BigInt) }, status: "pending" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, dirtyDocs, dirtyArchives, pendingCandidates, llmCallsSinceStart };
}

function summarizeChecks(checks) {
  return {
    duplicateArchiveCount: checks.duplicateArchives.length,
    uniqueIndexPresent: checks.uniqueIndexPresent,
    dirtyDocs: checks.dirtyDocs,
    dirtyArchives: checks.dirtyArchives,
    pendingCandidates: checks.pendingCandidates,
    llmCallsSinceStart: checks.llmCallsSinceStart,
  };
}
