import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient({ log: ["error", "warn"] });
const documentIds = Array.from({ length: 100 }, (_, index) => index + 101);
const json = (value) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);
const { normalizeExtractionWithDictionary } = await import("../apps/server/src/modules/productConfigAgent/normalization/index.ts");

function fieldCount(normalized) {
  return (Array.isArray(normalized?.items) ? normalized.items : [])
    .reduce((sum, item) => sum + Object.keys(item.fields ?? {}).length, 0);
}

function proposals(normalized) {
  return Array.isArray(normalized?.dictionaryProposals?.proposals) ? normalized.dictionaryProposals.proposals : [];
}

function proposalKey(proposal) {
  return [proposal.candidateType, proposal.termType, proposal.rawValue].map((item) => String(item ?? "")).join("\u0000");
}

function identity(item) {
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
    const beforeProposals = proposals({ dictionaryProposals: row.dictionaryProposals });
    const afterProposals = proposals(after);
    const beforeKeys = new Set(beforeProposals.map(proposalKey));
    const afterKeys = new Set(afterProposals.map(proposalKey));
    results.push({
      documentId,
      extractionResultId: Number(row.id),
      before: {
        itemCount: Array.isArray(before?.items) ? before.items.length : 0,
        fieldCount: fieldCount(before),
        proposalCount: beforeProposals.length,
        itemIdentities: (before?.items ?? []).map(identity),
        documentInfo: before?.document_info ?? {},
      },
      after: {
        itemCount: Array.isArray(after?.items) ? after.items.length : 0,
        fieldCount: fieldCount(after),
        proposalCount: afterProposals.length,
        itemIdentities: (after?.items ?? []).map(identity),
        documentInfo: after.document_info ?? {},
      },
      removedProposals: beforeProposals.filter((item) => !afterKeys.has(proposalKey(item))).slice(0, 80),
      addedProposals: afterProposals.filter((item) => !beforeKeys.has(proposalKey(item))).slice(0, 80),
      afterWarnings: after.warnings,
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
  const outPath = path.resolve("tmp/codex-doc101-200-normalization-dry-run.json");
  fs.writeFileSync(outPath, json(out));
  console.log(json({
    outPath,
    totals: out.totals,
    changedIdentities: results
      .filter((item) => json(item.before?.itemIdentities) !== json(item.after?.itemIdentities))
      .map((item) => ({ documentId: item.documentId, before: item.before.itemIdentities, after: item.after.itemIdentities })),
    changedDocumentInfo: results
      .filter((item) => json(item.before?.documentInfo) !== json(item.after?.documentInfo))
      .map((item) => ({ documentId: item.documentId, before: item.before.documentInfo, after: item.after.documentInfo })),
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}
