import { sqlGuardService, type SqlGuardResult } from "../../sqlGuard/index.js";
import type { SqlGeneratorGuard } from "../../generator/index.js";
import type { SqlRuntimeGuardInput, SqlRuntimeGuardResult } from "../types/SqlRuntimeGuardTypes.js";
import { evaluateSqlSemantic } from "./sqlSemanticFamilies.js";

export class SqlRuntimeGuardService {
  constructor(private readonly schemaGuard: SqlGeneratorGuard = sqlGuardService) {}

  async validate(input: SqlRuntimeGuardInput): Promise<SqlRuntimeGuardResult> {
    const references = input.references ?? [];
    const schemaResult = await this.schemaGuard.validate(input.sql, {
      ...input.guardOptions,
      financeMode: input.financeMode ?? input.guardOptions?.financeMode,
      references,
    });
    const semanticResult = evaluateSqlSemantic({
      question: input.question,
      sql: input.sql,
      references,
      queryPlan: input.queryPlan,
      analysisPlan: input.analysisPlan,
      financeMode: input.financeMode,
      lowConfidence: input.lowConfidence,
    });
    const guardResult: SqlGuardResult = {
      ...schemaResult,
      valid: schemaResult.valid && semanticResult.valid,
      errors: uniqueStrings([...schemaResult.errors, ...semanticResult.errors]),
    };
    return {
      valid: guardResult.valid,
      sql: guardResult.valid ? input.sql : "",
      candidateSql: input.sql,
      guardResult,
      semanticResult,
    };
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export const sqlRuntimeGuardService = new SqlRuntimeGuardService();
