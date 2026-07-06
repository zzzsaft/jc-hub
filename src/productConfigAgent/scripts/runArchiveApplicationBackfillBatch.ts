import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../lib/prisma.js";
import { archiveItemSearchService } from "../archive/archiveItemSearch.service.js";
import {
  buildArchiveSearchAcceptanceCaseReport,
  buildArchiveSearchAcceptanceReport,
  FIXED_RANDOM_BASELINE_CASES,
} from "../archive/archiveSearchAcceptance.js";
import {
  applyArchiveFeatureBackfill,
  auditArchiveFeatureCoverage,
  planArchiveFeatureBackfillFromDatabase,
  type ArchiveFeatureBackfillProposal,
} from "../archive/archiveFeatureCoverage.js";
import {
  isAllowedArchiveApplicationBackfillProposal,
  selectArchiveApplicationBackfillBatch,
  summarizeArchiveApplicationBackfillValues,
} from "../archive/archiveApplicationBackfillBatch.js";

type ArchiveApplicationBatchBackupRow = {
  id: string;
  similarityFeaturesJson: unknown;
  updatedAt: string | null;
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const limit = numberArg("--limit") ?? 2000;
  const maxUpdates = numberArg("--max-updates") ?? 50;
  const minConfidence = numberArg("--min-confidence") ?? 0.78;
  const proposalSampleLimit = numberArg("--proposal-sample") ?? 20;
  const apply = args.has("--apply");

  const planned = await planArchiveFeatureBackfillFromDatabase({ limit });
  const highConfidenceRejected = planned.filter((proposal) => (
    proposal.confidence >= minConfidence
    && !isAllowedArchiveApplicationBackfillProposal(proposal, minConfidence)
  ));
  const batch = selectArchiveApplicationBackfillBatch(planned, { minConfidence, maxUpdates });
  const preApplyRows = apply ? await loadBackupRows(batch) : [];
  const preAcceptance = apply ? await runAcceptanceGate() : null;
  if (preAcceptance && preAcceptance.failedCases > 0) {
    console.log(JSON.stringify({
      mode: "blocked",
      reason: "pre_acceptance_failed",
      policy: { limit, maxUpdates, minConfidence },
      preAcceptance: summarizeAcceptance(preAcceptance),
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const backupPath = apply && batch.length > 0 ? await writeBackup(preApplyRows) : null;
  const applied = apply && batch.length > 0 ? await applyArchiveFeatureBackfill(batch) : { updatedCount: 0 };
  const postApplyRows = apply ? await loadBackupRows(batch) : [];
  const updatedAtChanged = apply ? compareUpdatedAt(preApplyRows, postApplyRows) : [];
  const postAcceptance = apply ? await runAcceptanceGate() : null;
  const postCoverage = apply ? await auditArchiveFeatureCoverage({ proposalSampleLimit: 0 }) : null;

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    policy: { limit, maxUpdates, minConfidence, proposalSampleLimit },
    safety: {
      allowedFeatureKey: "application",
      allowedSourceFieldPath: "itemName",
      rejectedHighConfidenceCount: highConfidenceRejected.length,
      selectedBatchAllowedOnly: batch.every((proposal) => isAllowedArchiveApplicationBackfillProposal(proposal, minConfidence)),
    },
    backfill: {
      plannedUpdateCount: planned.length,
      selectedUpdateCount: batch.length,
      appliedUpdateCount: applied.updatedCount,
      firstArchiveItemId: batch[0]?.archiveItemId ?? null,
      lastArchiveItemId: batch.at(-1)?.archiveItemId ?? null,
      valueCounts: summarizeArchiveApplicationBackfillValues(batch).slice(0, 20),
      proposals: batch.slice(0, proposalSampleLimit),
    },
    ...(backupPath ? { backupPath } : {}),
    ...(apply ? {
      updatedAtVerification: {
        checked: postApplyRows.length,
        changed: updatedAtChanged,
      },
      preAcceptance: preAcceptance ? summarizeAcceptance(preAcceptance) : null,
      postAcceptance: postAcceptance ? summarizeAcceptance(postAcceptance) : null,
      postCoverage: postCoverage ? {
        missingApplication: postCoverage.missing.application,
        recoverableApplication: postCoverage.recoverable.application,
      } : null,
    } : {}),
  }, null, 2));

  if (postAcceptance && postAcceptance.failedCases > 0) process.exitCode = 1;
  if (updatedAtChanged.length > 0) process.exitCode = 1;
}

async function runAcceptanceGate() {
  const caseReports = [];
  for (const acceptanceCase of FIXED_RANDOM_BASELINE_CASES) {
    const response = await archiveItemSearchService.searchArchiveItems({ ...acceptanceCase, limit: 5 });
    caseReports.push(buildArchiveSearchAcceptanceCaseReport(acceptanceCase, response));
  }
  return buildArchiveSearchAcceptanceReport(caseReports);
}

async function loadBackupRows(proposals: ArchiveFeatureBackfillProposal[]): Promise<ArchiveApplicationBatchBackupRow[]> {
  if (proposals.length === 0) return [];
  const ids = proposals.map((proposal) => BigInt(proposal.archiveItemId));
  const rows = await prisma.contractArchiveItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, similarityFeaturesJson: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: String(row.id),
    similarityFeaturesJson: row.similarityFeaturesJson,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));
}

async function writeBackup(rows: ArchiveApplicationBatchBackupRow[]) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(process.cwd(), `archive-feature-application-batch-${timestamp}-backup.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows }, null, 2));
  return backupPath;
}

function compareUpdatedAt(beforeRows: ArchiveApplicationBatchBackupRow[], afterRows: ArchiveApplicationBatchBackupRow[]) {
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  return afterRows
    .filter((after) => beforeById.get(after.id)?.updatedAt !== after.updatedAt)
    .map((after) => ({
      archiveItemId: after.id,
      before: beforeById.get(after.id)?.updatedAt ?? null,
      after: after.updatedAt,
    }));
}

function summarizeAcceptance(report: Awaited<ReturnType<typeof runAcceptanceGate>>) {
  return {
    totalCases: report.totalCases,
    passedCases: report.passedCases,
    failedCases: report.failedCases,
    scores: report.scores,
    failureCases: report.failureCases,
  };
}

function numberArg(name: string): number | undefined {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
