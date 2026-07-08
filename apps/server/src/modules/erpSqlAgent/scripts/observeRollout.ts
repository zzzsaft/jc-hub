import "../../../config/env.js";

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { parseArgs } from "../templates/scripts/cli.js";

type TraceRow = {
  traceId: string;
  question: string;
  status: string;
  sessionId: bigint | null;
  runId: bigint | null;
  ownerUserId: string | null;
  rolloutMode: string | null;
  generationJson: unknown;
  guardJson: unknown;
  executionJson: unknown;
  sqlText: string | null;
  rowCount: number | null;
  errorMessage: string | null;
  createdAt: Date;
};

type MessageRow = {
  sessionId: bigint;
  content: string | null;
  createdAt: Date;
};

const CORRECTION_PATTERN = /不对|错|不是|重新|改成|口径|为什么/u;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const hours = Math.max(1, Number(args.hours ?? 24) || 24);
  const limit = Math.max(1, Math.min(1000, Number(args.limit ?? 200) || 200));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const traces = await prisma.$queryRaw<TraceRow[]>(Prisma.sql`
    SELECT
      trace_id AS "traceId",
      question,
      status,
      session_id AS "sessionId",
      run_id AS "runId",
      owner_user_id AS "ownerUserId",
      rollout_mode AS "rolloutMode",
      generation_json AS "generationJson",
      guard_json AS "guardJson",
      execution_json AS "executionJson",
      sql_text AS "sqlText",
      row_count AS "rowCount",
      error_message AS "errorMessage",
      created_at AS "createdAt"
    FROM "erp_agent"."erp_sql_traces"
    WHERE created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  const sessionIds = [...new Set(traces.map((trace) => trace.sessionId).filter((id): id is bigint => id !== null))];
  const messages = sessionIds.length
    ? await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
        SELECT session_id AS "sessionId", content, created_at AS "createdAt"
        FROM "agent"."agent_messages"
        WHERE role = 'user'
          AND session_id IN (${Prisma.join(sessionIds)})
          AND created_at >= ${since}
      `)
    : [];

  const items = traces.map((trace) => {
    const generation = asRecord(trace.generationJson);
    const execution = asRecord(trace.executionJson);
    const guard = asRecord(trace.guardJson);
    const references = readReferences(generation.references);
    const followups = readFollowups(trace, messages);
    return {
      traceId: trace.traceId,
      createdAt: trace.createdAt,
      sessionId: trace.sessionId?.toString() ?? null,
      runId: trace.runId?.toString() ?? null,
      ownerUserId: trace.ownerUserId,
      rolloutMode: trace.rolloutMode,
      status: trace.status,
      question: trace.question,
      references,
      vectorScores: references.flatMap((reference) => reference.vectorScores),
      sql: trace.sqlText ?? generation.sql ?? "",
      guard: {
        valid: guard.valid ?? generation.guardResult?.valid ?? null,
        errors: guard.errors ?? generation.guardResult?.errors ?? [],
        warnings: guard.warnings ?? generation.guardResult?.warnings ?? [],
      },
      execution: {
        valid: execution.valid ?? null,
        executed: execution.executed ?? false,
        rowCount: trace.rowCount ?? execution.rowCount ?? 0,
        error: execution.error ?? trace.errorMessage ?? null,
      },
      followupCount: followups.length,
      corrected: followups.some((message) => CORRECTION_PATTERN.test(message.content ?? "")),
      followups: followups.map((message) => ({
        createdAt: message.createdAt,
        content: message.content,
      })),
    };
  });

  console.log(JSON.stringify({
    kind: "erp_sql_rollout_observation",
    hours,
    traceCount: items.length,
    generatedOnlyCount: items.filter((item) => item.execution.valid && !item.execution.executed).length,
    executedCount: items.filter((item) => item.execution.executed).length,
    failedCount: items.filter((item) => item.status === "failed").length,
    correctionCount: items.filter((item) => item.corrected).length,
    items,
  }, bigintReplacer, 2));
}

function readReferences(value: unknown): Array<{
  sourceType: string | null;
  datasetId: string | null;
  familyId: string | null;
  metricCode: string | null;
  score: number | null;
  matchedSignals: string[];
  vectorScores: number[];
}> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const reference = asRecord(item);
    const matchedSignals = Array.isArray(reference.matchedSignals)
      ? reference.matchedSignals.filter((signal): signal is string => typeof signal === "string")
      : [];
    return {
      sourceType: stringOrNull(reference.sourceType),
      datasetId: stringOrNull(reference.datasetId),
      familyId: stringOrNull(reference.familyId),
      metricCode: stringOrNull(reference.metricCode),
      score: typeof reference.score === "number" ? reference.score : null,
      matchedSignals,
      vectorScores: matchedSignals
        .map((signal) => /^vector:(\d+(?:\.\d+)?)$/u.exec(signal)?.[1])
        .filter((score): score is string => Boolean(score))
        .map(Number),
    };
  });
}

function readFollowups(trace: TraceRow, messages: MessageRow[]): MessageRow[] {
  if (trace.sessionId === null) return [];
  const end = trace.createdAt.getTime() + 30 * 60 * 1000;
  return messages.filter((message) =>
    message.sessionId === trace.sessionId
    && message.createdAt.getTime() > trace.createdAt.getTime()
    && message.createdAt.getTime() <= end
  );
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bigintReplacer(_: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
