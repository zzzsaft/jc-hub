import { llmSqlGeneratorService } from "./LlmSqlGeneratorService.js";
import { ruleSqlGeneratorService } from "./SqlGeneratorService.js";
import type { SqlGenerationResult, SqlGeneratorPlan } from "../types/SqlGeneratorTypes.js";

export type ErpSqlGenerator = {
  generate(plan: SqlGeneratorPlan): Promise<SqlGenerationResult>;
};

export class FallbackSqlGeneratorService {
  constructor(
    private readonly ruleGenerator: ErpSqlGenerator = ruleSqlGeneratorService,
    private readonly llmGenerator: ErpSqlGenerator = llmSqlGeneratorService,
    private readonly llmEnabled: () => boolean = () => process.env.ERP_SQL_AGENT_LLM_GENERATOR_ENABLED !== "false",
    private readonly ruleFallbackEnabled: () => boolean = () => process.env.ERP_SQL_AGENT_RULE_FALLBACK_ENABLED !== "false",
  ) {}

  async generate(plan: SqlGeneratorPlan): Promise<SqlGenerationResult> {
    if (!this.llmEnabled()) return this.ruleGenerator.generate(plan);

    try {
      return await this.llmGenerator.generate(plan);
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

export const fallbackSqlGeneratorService = new FallbackSqlGeneratorService();
