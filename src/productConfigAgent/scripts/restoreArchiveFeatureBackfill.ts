import fs from "node:fs/promises";
import { prisma } from "../../lib/prisma.js";

type BackupRow = {
  id?: unknown;
  archiveId?: unknown;
  itemIndex?: unknown;
  similarityFeaturesJson?: unknown;
};

async function main() {
  const backupPath = stringArg("--backup");
  if (!backupPath) throw new Error("Missing --backup=/path/to/archive-feature-backfill-backup.json");
  const apply = process.argv.includes("--apply");
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8")) as { rows?: BackupRow[] };
  const rows = Array.isArray(backup.rows) ? backup.rows : [];
  const restoreRows = rows
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      archiveId: row.archiveId === undefined || row.archiveId === null ? null : String(row.archiveId),
      itemIndex: row.itemIndex ?? null,
      similarityFeaturesJson: row.similarityFeaturesJson ?? {},
    }))
    .filter((row) => row.id);

  let changedCount = 0;
  const samples = [];
  for (const row of restoreRows) {
    const current = await prisma.contractArchiveItem.findUnique({
      where: { id: BigInt(row.id) },
      select: { similarityFeaturesJson: true },
    });
    if (!current) continue;
    const changed = JSON.stringify(current.similarityFeaturesJson ?? {}) !== JSON.stringify(row.similarityFeaturesJson ?? {});
    if (!changed) continue;
    changedCount += 1;
    if (samples.length < 20) {
      samples.push({
        archiveItemId: row.id,
        archiveId: row.archiveId,
        itemIndex: row.itemIndex,
        current: current.similarityFeaturesJson ?? {},
        restoreTo: row.similarityFeaturesJson ?? {},
      });
    }
    if (apply) {
      await prisma.contractArchiveItem.update({
        where: { id: BigInt(row.id) },
        data: { similarityFeaturesJson: row.similarityFeaturesJson ?? {} },
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    backupPath,
    backupRowCount: restoreRows.length,
    changedCount,
    appliedCount: apply ? changedCount : 0,
    samples,
  }, null, 2));
}

function stringArg(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
