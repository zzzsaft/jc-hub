import {
  runArchiveFeatureOptimizationBatch,
  type ArchiveFeatureOptimizationPolicy,
} from "../archive/archiveFeatureOptimizationLoop.js";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const policy: Partial<ArchiveFeatureOptimizationPolicy> = {
    limit: numberArg("--limit"),
    minConfidence: numberArg("--min-confidence"),
    maxBatchSize: numberArg("--max-batch-size") ?? numberArg("--max-updates"),
    autoApplyMinConfidence: numberArg("--auto-apply-min-confidence"),
  };
  const report = await runArchiveFeatureOptimizationBatch({
    batchId: stringArg("--batch-id") ?? undefined,
    apply,
    appliedBy: stringArg("--applied-by") ?? undefined,
    policy: stripUndefined(policy),
  });
  console.log(JSON.stringify(report, null, 2));
}

function numberArg(name: string): number | undefined {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function stringArg(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
