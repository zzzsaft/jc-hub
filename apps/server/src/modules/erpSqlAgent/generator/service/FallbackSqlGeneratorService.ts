import { llmSqlGeneratorService } from "./LlmSqlGeneratorService.js";
import { ruleSqlGeneratorService } from "./SqlGeneratorService.js";
import type { SqlGenerationResult, SqlGeneratorPlan } from "../types/SqlGeneratorTypes.js";

export type ErpSqlGenerator = {
  generate(plan: SqlGeneratorPlan, signal?: AbortSignal): Promise<SqlGenerationResult>;
};

export class FallbackSqlGeneratorService {
  constructor(
    private readonly ruleGenerator: ErpSqlGenerator = ruleSqlGeneratorService,
    private readonly llmGenerator: ErpSqlGenerator = llmSqlGeneratorService,
    private readonly llmEnabled: () => boolean = () => process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED !== "false",
    private readonly ruleFallbackEnabled: () => boolean = () => process.env.ERP_SQL_AGENT_RULE_FALLBACK_ENABLED !== "false",
  ) {}

  async generate(plan: SqlGeneratorPlan, signal?: AbortSignal): Promise<SqlGenerationResult> {
    if (!this.llmEnabled()) return this.ruleGenerator.generate(plan);

    try {
      const llmResult = await this.llmGenerator.generate(plan, signal);
      if (this.ruleFallbackEnabled() && !llmResult.valid && hasMissingSchemaError(llmResult.guardResult.errors)) {
        const ruleResult = await this.ruleGenerator.generate(plan);
        if (ruleResult.valid) {
          return {
            ...ruleResult,
            warnings: [...ruleResult.warnings, "LLM SQL fallback referenced fields missing from schema; used rule SQL fallback."],
          };
        }
        return {
          ...llmResult,
          sql: "",
          warnings: [...llmResult.warnings, "Rule SQL fallback was also invalid; SQL omitted."],
        };
      }
      return llmResult;
    } catch (error) {
      if (!this.ruleFallbackEnabled()) throw error;
      const ruleResult = await this.ruleGenerator.generate(plan);
      return {
        ...ruleResult,
        warnings: [...ruleResult.warnings, `LLM SQL fallback failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

function hasMissingSchemaError(errors: string[]): boolean {
  return errors.some((error) => /Referenced (?:field|table) does not exist in schema metadata/iu.test(error));
}

export const fallbackSqlGeneratorService = new FallbackSqlGeneratorService();
