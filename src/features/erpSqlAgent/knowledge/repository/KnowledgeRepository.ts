import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  CompanyRules,
  DateRules,
  ErpModuleRule,
  JoinRule,
  ModuleDateRule,
  PromptRules,
  QualityRules,
  StatusRule,
  StatusRules,
} from "../types/ErpKnowledge.types.js";

export class KnowledgeRepository {
  private readonly rulesDir: URL;
  private modules?: ErpModuleRule[];
  private joins?: JoinRule[];
  private dateRules?: DateRules;
  private statusRules?: StatusRules;
  private qualityRules?: QualityRules;
  private companyRules?: CompanyRules;
  private promptRules?: PromptRules;

  constructor(rulesDir = new URL("../rules/", import.meta.url)) {
    this.rulesDir = rulesDir;
  }

  getModule(module: string): ErpModuleRule | undefined {
    return this.getAllModules().find((rule) => rule.module === module);
  }

  getAllModules(): ErpModuleRule[] {
    this.modules ??= this.readRule<ErpModuleRule[]>("modules.json");
    return this.modules;
  }

  getJoinRules(module: string): JoinRule[] {
    this.joins ??= this.readRule<JoinRule[]>("joins.json");
    return this.joins.filter((rule) => rule.module === module);
  }

  getDateRules(): DateRules;
  getDateRules(module: string): ModuleDateRule | undefined;
  getDateRules(module?: string): DateRules | ModuleDateRule | undefined {
    this.dateRules ??= this.readRule<DateRules>("dateRules.json");
    if (!module) {
      return this.dateRules;
    }
    return this.dateRules.moduleDateFields.find((rule) => rule.module === module);
  }

  getStatusRules(): StatusRules;
  getStatusRules(module: string): StatusRule[];
  getStatusRules(module?: string): StatusRules | StatusRule[] {
    this.statusRules ??= this.readRule<StatusRules>("statusRules.json");
    if (!module) {
      return this.statusRules;
    }
    if (!this.getModule(module)) {
      return [];
    }
    return this.statusRules.rules.filter((rule) => !rule.module || rule.module === module);
  }

  getQualityRules(): QualityRules {
    this.qualityRules ??= this.readRule<QualityRules>("qualityRules.json");
    return this.qualityRules;
  }

  getCompanyRules(): CompanyRules {
    this.companyRules ??= this.readRule<CompanyRules>("companyRules.json");
    return this.companyRules;
  }

  getPromptRules(): PromptRules {
    this.promptRules ??= this.readRule<PromptRules>("promptRules.json");
    return this.promptRules;
  }

  private readRule<T>(fileName: string): T {
    const fileUrl = new URL(fileName, this.rulesDir);
    try {
      const raw = readFileSync(fileURLToPath(fileUrl), "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read ERP knowledge rule ${fileName}: ${message}`);
    }
  }
}
