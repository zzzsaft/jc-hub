import { sqlGuardService, type SqlGuardResult } from "../../sqlGuard/index.js";
import type { SqlGeneratorGuard } from "../../generator/index.js";
import type { SqlRuntimeGuardInput, SqlRuntimeGuardResult } from "../types/SqlRuntimeGuardTypes.js";
import { evaluateSqlSemantic } from "./sqlSemanticFamilies.js";
import { AnalysisPlanCoverageService } from "./AnalysisPlanCoverageService.js";

export class SqlRuntimeGuardService {
  constructor(
    private readonly schemaGuard: SqlGeneratorGuard = sqlGuardService,
    private readonly coverageGuard = new AnalysisPlanCoverageService(),
  ) {}

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
      source: input.source,
    });
    const coverageResult = this.coverageGuard.validate(
      input.sql,
      input.analysisPlan,
      input.diagnosticBusinessGateBypass ? input.diagnosticRequiredCoverage : undefined,
    );
    if (!coverageResult.valid) {
      semanticResult.valid = false;
      semanticResult.status = "semantic_mismatch";
      semanticResult.errors = uniqueStrings([...semanticResult.errors, ...coverageResult.errors]);
    }
    const diagnosticSemanticBypass = input.diagnosticBusinessGateBypass && coverageResult.valid;
    if (diagnosticSemanticBypass && !semanticResult.valid) {
      semanticResult.valid = true;
      semanticResult.status = "estimate";
    }
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
      coverageResult,
    };
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export const sqlRuntimeGuardService = new SqlRuntimeGuardService();
