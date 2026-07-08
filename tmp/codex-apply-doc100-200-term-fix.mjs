import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const reviewedBy = "codex_doc100_200_term_fix_20260708";
const rangeDocumentIds = Array.from({ length: 101 }, (_, index) => index + 100);
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

const { prisma } = await import("../apps/server/src/lib/prisma.ts");
const { productConfigAgentRepository } = await import("../apps/server/src/modules/productConfigAgent/db.service.ts");
const { productConfigAgentService } = await import("../apps/server/src/modules/productConfigAgent/service.ts");
const { normalizeAlias, dictionaryMatcherService } = await import("../apps/server/src/modules/productConfigAgent/dictionary/matcher.service.ts");

const startedAt = new Date();

const termTypeAliases = [
  ["适用塑料原料", "plastic_material"],
  ["应用领域", "application"],
  ["规格型号与原产品互配", "specification_compatible_with_original"],
  ["规格型号与原产品相同", "specification_identical_to_original"],
  ["适用产量", "capacity"],
  ["加热电压", "heating_voltage"],
  ["唇开档", "lip_gap"],
  ["尺寸", "dimension"],
  ["唇调节方式", "lip_adjustment_method"],
  ["转速", "rotation_speed"],
  ["制品有效宽度", "product_effective_width"],
  ["模头加热分区（模体）", "heating_zone_description"],
  ["型号", "product_model"],
  ["规格", "product_specification"],
  ["铰链", "hinge_config"],
  ["紧固件", "screw_type"],
  ["fastener_type", "screw_type"],
];

const termTypes = [
  ["customer_notes", "客户备注", "text", "document_info", "document_info", "客户或订单层面的备注说明。"],
  ["customer_name", "客户", "text", "document_info", "document_info", "客户名称。"],
  ["product_model", "型号", "text", "item", "basic", "产品、配件或外购件型号。"],
  ["hinge_config", "铰链配置", "text", "item", "structure", "铰链、开合或连接铰链相关配置。"],
  ["product_specification", "规格", "text", "item", "basic", "产品规格或规格型号说明。"],
  ["reference_die", "参考模头", "text", "item", "history", "参考历史模头或原模头信息。"],
  ["connection_method", "连接方式", "text", "item", "structure", "机械、电气或管路连接方式。"],
  ["lip_tip_angle", "模唇尖角", "text", "item", "dimension", "模唇尖角、尖角尺寸或角度要求。"],
  ["filter_material_heat_treatment", "过滤器材质/热处理", "text", "item", "material", "过滤器材质及热处理要求。"],
  ["hydraulic_cylinder_mounting_method", "油缸安装方式", "text", "item", "hydraulic", "油缸安装、布置或固定方式。"],
  ["seal_requirement", "密封要求", "text", "item", "structure", "密封结构、密封圈或密封面要求。"],
  ["back_pressure_valve_config", "可更换倍压阀", "text", "item", "hydraulic", "可更换倍压阀或背压阀配置。"],
  ["temperature_hole_config", "测温孔配置", "text", "item", "thermal", "测温孔位置、数量、规格或配置说明。"],
  ["plug_connection_requirement", "接插接要求", "text", "item", "electrical", "插头、接插件或接插接要求。"],
  ["lower_mold_temperature_hole_distance", "下模测温点距内表面距离", "text", "item", "thermal", "下模测温点到内表面的距离要求。"],
];

try {
  const before = await snapshot();
  fs.writeFileSync("tmp/codex-doc100-200-term-fix-before.json", json(before));

  const termTypeResults = [];
  for (const [termType, displayName, kind, scope, category, description] of termTypes) {
    const existing = await prisma.dictionaryTermType.findUnique({ where: { termType } });
    const row = existing
      ? await productConfigAgentRepository.updateTermType(existing.id, {
          displayName,
          kind,
          metadata: { scope, category, description, applicableProductTypes: existing.applicableProductTypes ?? ["common"] },
          isActive: true,
        })
      : await productConfigAgentRepository.upsertTermType({
          termType,
          displayName,
          kind,
          metadata: { scope, category, description, applicableProductTypes: ["common"] },
        });
    termTypeResults.push({ termType, action: existing ? "update" : "create", row });
  }

  const aliasResults = [];
  for (const [aliasValue, termType] of termTypeAliases) {
    aliasResults.push(await upsertTermTypeAlias(termType, aliasValue));
  }

  const screwType = await productConfigAgentRepository.upsertValue({
    termType: "screw_type",
    canonicalValue: "12.9高强度",
    displayName: "12.9高强度",
  });
  const screwAlias = await upsertValueAlias(BigInt(screwType.id), "screw_type", "12.9");
  const surfaceRoughness = await reactivateTerm("surface_roughness", "A级（0.02-0.03μm）");

  dictionaryMatcherService.invalidate();

  const refreshRuns = [];
  for (const documentId of rangeDocumentIds) {
    refreshRuns.push({
      documentId,
      result: await productConfigAgentService.runDictionaryDirtyRefresh({ documentId: String(documentId), source: reviewedBy }),
    });
  }

  const checks = await runChecks();
  const report = {
    reviewedBy,
    startedAt,
    termTypeResults,
    aliasResults,
    valueResults: { screwType, screwAlias, surfaceRoughness },
    refreshRuns,
    checks,
    businessLlmTokens: 0,
  };
  fs.writeFileSync("tmp/codex-doc100-200-term-fix-result.json", json(report));
  console.log(json({
    termTypeCount: termTypeResults.length,
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

async function upsertTermTypeAlias(termType, aliasValue) {
  const before = await prisma.dictionaryTermTypeAlias.findUnique({ where: { normalizedAlias: normalizeAlias(aliasValue) } });
  const row = await prisma.dictionaryTermTypeAlias.upsert({
    where: { normalizedAlias: normalizeAlias(aliasValue) },
    create: {
      termType,
      aliasValue,
      normalizedAlias: normalizeAlias(aliasValue),
      source: reviewedBy,
      isActive: true,
    },
    update: {
      termType,
      aliasValue,
      source: reviewedBy,
      isActive: true,
    },
  });
  await productConfigAgentRepository.bumpDictionaryVersion("upsert_term_type_alias", "term_type_alias", String(row.id), row, before, reviewedBy);
  return row;
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

async function reactivateTerm(termType, canonicalValue) {
  const row = await prisma.dictionaryTerm.findUnique({ where: { termType_canonicalValue: { termType, canonicalValue } } });
  if (!row) return productConfigAgentRepository.upsertValue({ termType, canonicalValue, displayName: canonicalValue });
  if (row.isActive) return row;
  return productConfigAgentRepository.updateValue(row.id, { isActive: true, displayName: row.displayName ?? canonicalValue });
}

async function snapshot() {
  return {
    generatedAt: new Date().toISOString(),
    documents: await prisma.productDocument.findMany({
      where: { id: { in: rangeDocumentIds.map(BigInt) } },
      select: { id: true, status: true, dictionaryDirty: true },
      orderBy: { id: "asc" },
    }),
    latestExtractions: await prisma.extractionResult.findMany({
      where: { documentId: { in: rangeDocumentIds.map(BigInt) } },
      select: { id: true, documentId: true, llmModel: true, promptVersion: true, createdAt: true },
      orderBy: [{ documentId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    archives: await prisma.contractArchive.findMany({
      where: { documentId: { in: rangeDocumentIds.map(BigInt) } },
      select: { id: true, documentId: true, extractionResultId: true, dirtyReason: true, status: true },
      orderBy: [{ documentId: "asc" }, { id: "asc" }],
    }),
    termTypes: await prisma.dictionaryTermType.findMany({
      where: { termType: { in: termTypes.map(([termType]) => termType) } },
      orderBy: { termType: "asc" },
    }),
    termTypeAliases: await prisma.dictionaryTermTypeAlias.findMany({
      where: { normalizedAlias: { in: termTypeAliases.map(([aliasValue]) => normalizeAlias(aliasValue)) } },
      orderBy: { id: "asc" },
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
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const dirtyDocs = await prisma.productDocument.findMany({
    where: { id: { in: rangeDocumentIds.map(BigInt) }, dictionaryDirty: true },
    select: { id: true, status: true, dictionaryDirty: true },
    orderBy: { id: "asc" },
  });
  const dirtyArchives = await prisma.contractArchive.findMany({
    where: { documentId: { in: rangeDocumentIds.map(BigInt) }, dirtyReason: { not: null } },
    select: { id: true, documentId: true, dirtyReason: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const pendingCandidates = await prisma.dictionaryCandidate.findMany({
    where: { documentId: { in: rangeDocumentIds.map(BigInt) }, status: "pending" },
    select: { id: true, documentId: true, termType: true, rawValue: true, status: true },
    orderBy: [{ documentId: "asc" }, { id: "asc" }],
  });
  const llmCallsSinceStart = await prisma.llmCallLog.count({ where: { createdAt: { gte: startedAt } } }).catch(() => null);
  return { duplicateArchives, uniqueIndexPresent: indexRows.length === 1, indexRows, dirtyDocs, dirtyArchives, pendingCandidates, llmCallsSinceStart };
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
