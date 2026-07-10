import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type RetentionCounts = { llmCalls: number; agentMessages: number; agentToolCalls: number; erpSqlTraces: number };

export function buildRetentionReport(now: Date, days: number, counts: RetentionCounts) {
  const safeDays = Math.max(1, Math.trunc(days));
  return {
    mode: "dry-run" as const,
    generatedAt: now.toISOString(),
    retentionDays: safeDays,
    cutoff: new Date(now.getTime() - safeDays * 86_400_000).toISOString(),
    candidates: counts,
    candidateTotal: Object.values(counts).reduce((sum, count) => sum + count, 0),
    writesPerformed: false,
  };
}

async function main(): Promise<void> {
  const days = Number(process.env.ERP_AUDIT_RETENTION_DAYS ?? 90);
  const now = new Date();
  const cutoff = new Date(now.getTime() - Math.max(1, Math.trunc(days)) * 86_400_000);
  const [row] = await prisma.$queryRaw<Array<Record<keyof RetentionCounts, bigint>>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM agent.llm_call_logs WHERE created_at < ${cutoff}) AS "llmCalls",
      (SELECT COUNT(*) FROM agent.agent_messages WHERE created_at < ${cutoff}) AS "agentMessages",
      (SELECT COUNT(*) FROM agent.agent_tool_calls WHERE created_at < ${cutoff}) AS "agentToolCalls",
      (SELECT COUNT(*) FROM erp_agent.erp_sql_traces WHERE created_at < ${cutoff}) AS "erpSqlTraces"
  `);
  const report = buildRetentionReport(now, days, {
    llmCalls: Number(row?.llmCalls ?? 0n),
    agentMessages: Number(row?.agentMessages ?? 0n),
    agentToolCalls: Number(row?.agentToolCalls ?? 0n),
    erpSqlTraces: Number(row?.erpSqlTraces ?? 0n),
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("auditLogRetention.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(() => prisma.$disconnect());
}
