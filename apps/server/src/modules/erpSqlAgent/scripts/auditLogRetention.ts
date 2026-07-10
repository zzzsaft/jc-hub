import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type RetentionCounts = { llmCalls: number; agentMessages: number; agentToolCalls: number; erpSqlTraces: number };
export type RetentionMode = "dry-run" | "apply";

export function buildRetentionReport(now: Date, days: number, counts: RetentionCounts, mode: RetentionMode = "dry-run", applied: Partial<RetentionCounts> = {}) {
  const safeDays = Math.max(1, Math.trunc(days));
  return {
    mode,
    generatedAt: now.toISOString(),
    retentionDays: safeDays,
    cutoff: new Date(now.getTime() - safeDays * 86_400_000).toISOString(),
    candidates: counts,
    applied,
    candidateTotal: Object.values(counts).reduce((sum, count) => sum + count, 0),
    writesPerformed: mode === "apply",
  };
}

async function main(): Promise<void> {
  const days = Number(process.env.ERP_AUDIT_RETENTION_DAYS ?? 90);
  const apply = process.argv.includes("--apply");
  const batchSize = positiveInt(readArg("--batch-size="), 1000);
  const now = new Date();
  const cutoff = readArg("--before=") ? new Date(readArg("--before=")!) : new Date(now.getTime() - Math.max(1, Math.trunc(days)) * 86_400_000);
  const counts = await countCandidates(cutoff);
  const applied = apply ? await applyCleanup(cutoff, batchSize) : {};
  console.log(JSON.stringify(buildRetentionReport(now, days, counts, apply ? "apply" : "dry-run", applied), null, 2));
}

async function countCandidates(cutoff: Date): Promise<RetentionCounts> {
  const [row] = await prisma.$queryRaw<Array<Record<keyof RetentionCounts, bigint>>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM agent.llm_call_logs WHERE created_at < ${cutoff}) AS "llmCalls",
      (SELECT COUNT(*) FROM agent.agent_messages WHERE created_at < ${cutoff}) AS "agentMessages",
      (SELECT COUNT(*) FROM agent.agent_tool_calls WHERE created_at < ${cutoff}) AS "agentToolCalls",
      (SELECT COUNT(*) FROM erp_agent.erp_sql_traces WHERE created_at < ${cutoff}) AS "erpSqlTraces"
  `);
  return {
    llmCalls: Number(row?.llmCalls ?? 0n),
    agentMessages: Number(row?.agentMessages ?? 0n),
    agentToolCalls: Number(row?.agentToolCalls ?? 0n),
    erpSqlTraces: Number(row?.erpSqlTraces ?? 0n),
  };
}

async function applyCleanup(cutoff: Date, batchSize: number): Promise<RetentionCounts> {
  const [llmCalls, agentToolCalls, agentMessages, erpSqlTraces] = await prisma.$transaction([
    deleteBatch("agent.llm_call_logs", cutoff, batchSize),
    deleteBatch("agent.agent_tool_calls", cutoff, batchSize),
    deleteBatch("agent.agent_messages", cutoff, batchSize),
    deleteBatch("erp_agent.erp_sql_traces", cutoff, batchSize),
  ]);
  return { llmCalls, agentMessages, agentToolCalls, erpSqlTraces };
}

function deleteBatch(table: string, cutoff: Date, batchSize: number) {
  return prisma.$executeRawUnsafe(`
    WITH doomed AS (
      SELECT id FROM ${table}
      WHERE created_at < $1
      ORDER BY created_at
      LIMIT $2
    )
    DELETE FROM ${table}
    WHERE id IN (SELECT id FROM doomed)
  `, cutoff, batchSize);
}

function readArg(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

if (process.argv[1]?.endsWith("auditLogRetention.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
