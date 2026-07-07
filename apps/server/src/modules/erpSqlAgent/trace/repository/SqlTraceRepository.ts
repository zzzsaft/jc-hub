import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import type {
  SqlTraceRepositoryCreateInput,
  SqlTraceRepositoryUpdateInput,
} from "../types/SqlTraceTypes.js";

export class PrismaSqlTraceRepository {
  async create(input: SqlTraceRepositoryCreateInput): Promise<void> {
    await prisma.$executeRaw`
      insert into "erp_agent"."erp_sql_traces" (
        "trace_id", "question", "status", "warnings_json"
      ) values (
        ${input.traceId}::uuid,
        ${input.question},
        ${input.status},
        ${JSON.stringify(input.warnings)}::jsonb
      )
    `;
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
    if (fields.length === 0) return;

    await prisma.$executeRaw(Prisma.sql`
      update "erp_agent"."erp_sql_traces"
      set ${Prisma.join(fields, ", ")}
      where "trace_id" = ${traceId}::uuid
    `);
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const sqlTraceRepository = new PrismaSqlTraceRepository();
