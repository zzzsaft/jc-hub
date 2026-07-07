import {
  rollbackArchiveFeatureOptimizationBatch,
  verifyArchiveFeatureRollbackBatch,
} from "../archive/archiveFeatureOptimizationLoop.js";

async function main() {
  const batchId = stringArg("--batch-id");
  if (!batchId) throw new Error("Missing --batch-id=<archive-feature-batch-id>");
  if (process.argv.includes("--verify-only")) {
    const report = await verifyArchiveFeatureRollbackBatch(batchId);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const report = await rollbackArchiveFeatureOptimizationBatch({
    batchId,
    reason: stringArg("--reason") ?? undefined,
  });
  console.log(JSON.stringify(report, null, 2));
}

function stringArg(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
