import { sqlGuardService } from "../../sqlGuard/index.js";
import type { SqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import { sqlTemplateRepository } from "../repository/SqlTemplateRepository.js";
import type { SqlTemplateParamMap, TemplateDraftInput } from "../types/SqlTemplateTypes.js";

const QUOTED_FR_PARAM_PATTERN = /'\s*\$\{\s*([A-Za-z_][\w]*)\s*\}\s*'/gu;
const FR_PARAM_PATTERN = /\$\{\s*([A-Za-z_][\w]*)\s*\}/gu;

export class SqlTemplatePromotionService {
  constructor(
    private readonly repository: Pick<SqlTemplateRepository, "findDataset" | "createTemplateDraft"> = sqlTemplateRepository,
    private readonly guard: Pick<typeof sqlGuardService, "validate"> = sqlGuardService,
  ) {}

  async promote(input: TemplateDraftInput) {
    const dataset = await this.repository.findDataset(input.datasetId);
    if (!dataset) throw new Error(`Dataset not found: ${input.datasetId.toString()}`);

    const sqlTemplate = parameterizeFineReportSql(dataset.rawSql);
    const requiredParams = paramsFromDynamicParams(readStringArray(dataset.dynamicParams));
    const guardResult = await this.guard.validate(sqlTemplate);

    return this.repository.createTemplateDraft({
      ...input,
      name: input.name ?? dataset.datasetName ?? dataset.reportFile.reportName ?? `${input.module}.${input.intent}`,
      sqlTemplate,
      requiredParams,
      optionalParams: {},
      tables: guardResult.referencedTables,
      fields: guardResult.referencedFields,
    });
  }
}

export function parameterizeFineReportSql(sql: string): string {
  return sql
    .replace(QUOTED_FR_PARAM_PATTERN, (_match, name: string) => `@${name}`)
    .replace(FR_PARAM_PATTERN, (_match, name: string) => `@${name}`);
}

function paramsFromDynamicParams(params: string[]): SqlTemplateParamMap {
  return Object.fromEntries(params.map((param) => [param, {
    type: "string",
    sqlType: "NVarChar",
    required: true,
    description: param,
  }]));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export const sqlTemplatePromotionService = new SqlTemplatePromotionService();
