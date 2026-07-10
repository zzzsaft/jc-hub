import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import { runAuditDbWrite } from "../../../../ai/audit/auditDbLimiter.js";
import type {
  SqlTraceRepositoryCreateInput,
  SqlTraceRepositoryUpdateInput,
} from "../types/SqlTraceTypes.js";

export class PrismaSqlTraceRepository {
  async create(input: SqlTraceRepositoryCreateInput): Promise<void> {
    await runAuditDbWrite(() => prisma.$executeRaw`
      insert into "erp_agent"."erp_sql_traces" (
        "trace_id", "question", "question_hash", "status", "warnings_json", "session_id", "run_id", "owner_user_id", "rollout_mode", "audit_json"
      ) values (
        ${input.traceId}::uuid,
        ${input.question},
        ${input.questionHash},
        ${input.status},
        ${JSON.stringify(input.warnings)}::jsonb,
        ${input.sessionId ? BigInt(input.sessionId) : null},
        ${input.runId ? BigInt(input.runId) : null},
        ${input.ownerUserId ?? null},
        ${input.rolloutMode ?? null},
        ${JSON.stringify(input.auditJson)}::jsonb
      )
      ON CONFLICT ("trace_id") DO NOTHING
    `).then(() => undefined);
  }

  async update(traceId: string, input: SqlTraceRepositoryUpdateInput): Promise<void> {
    const fields: Prisma.Sql[] = [];
    if (input.status !== undefined) fields.push(Prisma.sql`"status" = ${input.status}`);
    if (input.plan !== undefined) fields.push(Prisma.sql`"plan_json" = ${json(input.plan)}::jsonb`);
    if (input.generation !== undefined) fields.push(Prisma.sql`"generation_json" = ${json(input.generation)}::jsonb`);
    if (input.sqlText !== undefined) fields.push(Prisma.sql`"sql_text" = ${input.sqlText}`);
    if (input.guard !== undefined) fields.push(Prisma.sql`"guard_json" = ${json(input.guard)}::jsonb`);
    if (input.execution !== undefined) fields.push(Prisma.sql`"execution_json" = ${json(input.execution)}::jsonb`);
    if (input.rowCount !== undefined) fields.push(Prisma.sql`"row_count" = ${input.rowCount}`);
    if (input.elapsedMs !== undefined) fields.push(Prisma.sql`"elapsed_ms" = ${input.elapsedMs}`);
    if (input.errorMessage !== undefined) fields.push(Prisma.sql`"error_message" = ${input.errorMessage}`);
    if (input.warnings !== undefined) fields.push(Prisma.sql`"warnings_json" = ${json(input.warnings)}::jsonb`);
    if (input.assumptions !== undefined) fields.push(Prisma.sql`"assumptions_json" = ${json(input.assumptions)}::jsonb`);
    if (input.sessionId !== undefined) fields.push(Prisma.sql`"session_id" = ${input.sessionId ? BigInt(input.sessionId) : null}`);
    if (input.runId !== undefined) fields.push(Prisma.sql`"run_id" = ${input.runId ? BigInt(input.runId) : null}`);
    if (input.ownerUserId !== undefined) fields.push(Prisma.sql`"owner_user_id" = ${input.ownerUserId}`);
    if (input.rolloutMode !== undefined) fields.push(Prisma.sql`"rollout_mode" = ${input.rolloutMode}`);
    if (input.sqlHash !== undefined) fields.push(Prisma.sql`"sql_hash" = ${input.sqlHash}`);
    if (input.auditDegraded !== undefined) fields.push(Prisma.sql`"audit_degraded" = ${input.auditDegraded}`);
    if (input.auditJson !== undefined) fields.push(Prisma.sql`"audit_json" = "audit_json" || ${json(input.auditJson)}::jsonb`);
    if (fields.length === 0) return;

    await runAuditDbWrite(() => prisma.$executeRaw(Prisma.sql`
      update "erp_agent"."erp_sql_traces"
      set ${Prisma.join(fields, ", ")}
      where "trace_id" = ${traceId}::uuid
    `)).then(() => undefined);
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const sqlTraceRepository = new PrismaSqlTraceRepository();
