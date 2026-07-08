import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { normalizeExtractionWithDictionary } = await import("../apps/server/build/modules/productConfigAgent/normalization/index.js");
const prisma = new PrismaClient({ log: ["error", "warn"] });

const documentIds = Array.from({ length: 20 }, (_, index) => index + 10);
const json = (value) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);

function fieldCount(normalized) {
  return (Array.isArray(normalized?.items) ? normalized.items : [])
    .reduce((sum, item) => sum + Object.keys(item.fields ?? {}).length, 0);
}

function proposalCount(normalized) {
  return Array.isArray(normalized?.dictionaryProposals?.proposals) ? normalized.dictionaryProposals.proposals.length : 0;
}

function proposalKey(proposal) {
  return [proposal.candidateType, proposal.termType, proposal.rawValue].map((item) => String(item ?? "")).join("\u0000");
}

function itemIdentity(item) {
  return {
    itemIndex: item.item_index,
    itemName: item.item_name,
    quantity: item.item_quantity,
    productType: item.product_type_hint,
  };
}

try {
  const rows = await prisma.extractionResult.findMany({
    where: { documentId: { in: documentIds.map(BigInt) } },
    orderBy: [{ documentId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const latest = new Map();
  for (const row of rows) if (!latest.has(String(row.documentId))) latest.set(String(row.documentId), row);

  const results = [];
  for (const documentId of documentIds) {
    const row = latest.get(String(documentId));
    if (!row) {
      results.push({ documentId, error: "missing_extraction" });
      continue;
    }
    const before = row.normalizedExtractionJson;
    const after = await normalizeExtractionWithDictionary(row.extractionJson);
    const beforeProposals = Array.isArray(row.dictionaryProposals?.proposals) ? row.dictionaryProposals.proposals : [];
    const afterProposals = Array.isArray(after.dictionaryProposals?.proposals) ? after.dictionaryProposals.proposals : [];
    const beforeKeys = new Set(beforeProposals.map(proposalKey));
    const afterKeys = new Set(afterProposals.map(proposalKey));
    const removed = beforeProposals.filter((item) => !afterKeys.has(proposalKey(item)));
    const added = afterProposals.filter((item) => !beforeKeys.has(proposalKey(item)));
    results.push({
      documentId,
      extractionResultId: Number(row.id),
      before: {
        itemCount: Array.isArray(before?.items) ? before.items.length : 0,
        fieldCount: fieldCount(before),
        proposalCount: beforeProposals.length,
        warningsCount: Array.isArray(row.warnings) ? row.warnings.length : 0,
        itemIdentities: (before?.items ?? []).map(itemIdentity),
      },
      after: {
        itemCount: Array.isArray(after?.items) ? after.items.length : 0,
        fieldCount: fieldCount(after),
        proposalCount: proposalCount(after),
        warningsCount: Array.isArray(after.warnings) ? after.warnings.length : 0,
        itemIdentities: (after?.items ?? []).map(itemIdentity),
      },
      removedProposals: removed.slice(0, 50),
      addedProposals: added.slice(0, 50),
      afterWarnings: after.warnings,
      afterNormalizedSummary: {
        document_info: after.document_info,
        items: (after.items ?? []).map((item) => ({
          item_index: item.item_index,
          item_name: item.item_name,
          item_quantity: item.item_quantity,
          product_type_hint: item.product_type_hint,
          fields: item.fields,
        })),
      },
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    documentIds,
    results,
    totals: {
      beforeProposals: results.reduce((sum, item) => sum + (item.before?.proposalCount ?? 0), 0),
      afterProposals: results.reduce((sum, item) => sum + (item.after?.proposalCount ?? 0), 0),
      beforeFields: results.reduce((sum, item) => sum + (item.before?.fieldCount ?? 0), 0),
      afterFields: results.reduce((sum, item) => sum + (item.after?.fieldCount ?? 0), 0),
    },
  };
  const outPath = path.resolve("tmp/codex-next20-normalization-dry-run.json");
  fs.writeFileSync(outPath, json(out));
  console.log(json({
    outPath,
    totals: out.totals,
    documents: results.map((item) => ({
      documentId: item.documentId,
      extractionResultId: item.extractionResultId,
      beforeProposals: item.before?.proposalCount,
      afterProposals: item.after?.proposalCount,
      beforeFields: item.before?.fieldCount,
      afterFields: item.after?.fieldCount,
      beforeItems: item.before?.itemCount,
      afterItems: item.after?.itemCount,
    })),
  }));
} finally {
  await prisma.$disconnect();
}
