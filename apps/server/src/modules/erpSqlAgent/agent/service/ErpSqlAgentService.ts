import { sqlExecutorService } from "../../executor/index.js";
import { sqlGeneratorService, type SqlReferenceHint } from "../../generator/index.js";
import { deepSeekIntentExtractor } from "../../intent/index.js";
import { sqlPlannerService } from "../../planner/index.js";
import { SqlExecutionResultSchema } from "../../schemas/index.js";
import { sqlTemplateExecutionService } from "../../templates/service/SqlTemplateExecutionService.js";
import { resolveJdyCrmCustomerName } from "../../../../integration/jdy/crmCustomers.js";
import {
  sqlTemplateRepository,
  type ApprovedMetricCandidate,
  type DatasetReferenceCandidate,
  type ExecutableTemplateCandidate,
  type ReferenceFamilyCandidate,
} from "../../templates/repository/SqlTemplateRepository.js";
import { sqlTraceService } from "../../trace/index.js";
import type { SqlTraceContext, SqlTraceStage } from "../../trace/index.js";
import type { ErpSqlQueryValue } from "../../query/index.js";
import type { SqlExecutionResult } from "../../executor/index.js";
import type { SqlGenerationResult } from "../../generator/index.js";
import type { QueryPlan } from "../../planner/index.js";
import type {
  ErpSqlAgentExecutor,
  ErpSqlAgentAskOptions,
  ErpSqlCustomerCandidate,
  ErpSqlCustomerNameResolver,
  ErpSqlAgentGenerator,
  ErpSqlAgentPlanner,
  ErpSqlAgentResult,
  ErpSqlIntentExtractor,
  SqlTraceWriter,
} from "../types/ErpSqlAgentTypes.js";
import { ERP_SQL_AGENT_SCOPE_ERROR, isErpSqlAgentQuestion } from "../domain.js";
import { isAbortError, throwIfAborted } from "../../../../lib/abort.js";
import { assertModuleAllowed } from "../../access/index.js";
import { evaluateSqlSemantic } from "../../runtimeGuard/index.js";

type TemplateCandidateRepository = Pick<
  typeof sqlTemplateRepository,
  "findExecutableCandidates" | "findDatasetReferenceCandidates" | "findReferenceCandidates" | "findApprovedMetricCandidates"
>;
type TemplateExecutor = Pick<typeof sqlTemplateExecutionService, "execute">;

const TEMPLATE_MATCH_THRESHOLD = 0.4;
const GENERATED_SQL_ROLLOUT_MODE = "generated_sql_observe";

export class ErpSqlAgentService {
  constructor(
    private readonly planner: ErpSqlAgentPlanner = sqlPlannerService,
    private readonly generator: ErpSqlAgentGenerator = sqlGeneratorService,
    private readonly executor: ErpSqlAgentExecutor = sqlExecutorService,
    private readonly intentExtractor?: ErpSqlIntentExtractor,
    private readonly traceService: SqlTraceWriter = sqlTraceService,
    private readonly templateRepository: TemplateCandidateRepository = sqlTemplateRepository,
    private readonly templateExecutor: TemplateExecutor = sqlTemplateExecutionService,
    private readonly resolveCustomerName: ErpSqlCustomerNameResolver = resolveJdyCrmCustomerName,
    private readonly requireAccessScope = false,
  ) {}

  async ask(question: string, options: ErpSqlAgentAskOptions = {}): Promise<ErpSqlAgentResult> {
    throwIfAborted(options.signal);
    if (this.requireAccessScope && !options.accessScope) throw new Error("ERP_SQL_ACCESS_DENIED: server authorization scope is required");
    const trace = await this.startTrace(question, options);
    if (!isErpSqlAgentQuestion(question)) {
      await this.recordFailure(trace, "planner", ERP_SQL_AGENT_SCOPE_ERROR);
      await this.finishTrace(trace, "failed");
      return blockedResult(question, trace.traceId, ERP_SQL_AGENT_SCOPE_ERROR, trace.warnings);
    }
    let intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>;
    try {
      intentResult = await this.extractIntent(question, options.signal);
    } catch (error) {
      await this.recordFailure(trace, "intent", error);
      throw error;
    }

    let plan: Awaited<ReturnType<ErpSqlAgentPlanner["plan"]>>;
    try {
      plan = await this.planner.plan(question, intentResult.intent, options.signal);
      if (options.accessScope) assertModuleAllowed(options.accessScope, plan.modules.map((item) => item.module));
      await this.recordTrace(trace, () => this.traceService.recordPlan(trace, plan));
    } catch (error) {
      await this.recordFailure(trace, "planner", error);
      throw error;
    }

    const templateResult = await this.tryTemplateExecution(trace, plan, intentResult, options);
    if (templateResult) return templateResult;

    let generation: Awaited<ReturnType<ErpSqlAgentGenerator["generate"]>>;
    let referenceHints: SqlReferenceHint[] = [];
    try {
      referenceHints = await this.findReferences(plan, intentResult, options.signal);
      if (isFinancePlan(plan, intentResult) && referenceHints.length === 0) {
        const error = "Finance SQL requires an approved business metric or approved SQL template.";
        generation = blockedGeneration(plan, error);
        await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
        await this.recordFailure(trace, "generator", error);
        await this.finishTrace(trace, "failed");
        return {
          success: false,
          traceId: trace.traceId,
          question: plan.question,
          intent: intentResult.intent,
          sql: generation.sql,
          plan,
          generation,
          execution: null,
          warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, trace.warnings),
          assumptions: generation.assumptions,
          error,
        };
      }
      generation = await this.generator.generate(referenceHints.length > 0 ? { ...plan, references: referenceHints } : plan, options.signal);
      generation = applySemanticResult(generation, evaluateSqlSemantic({
        question: plan.question,
        sql: generation.sql || generation.candidateSql || "",
        references: generation.references ?? referenceHints,
        queryPlan: plan,
        source: generation.source,
      }), options.accessScope?.devFullAccess === true);
      await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
    } catch (error) {
      await this.recordFailure(trace, "generator", error);
      throw error;
    }

    if (!generation.valid) {
      const error = generation.guardResult.errors.join("; ") || "SQL generation is invalid.";
      await this.recordFailure(trace, "generator", error);
      await this.finishTrace(trace, "failed");
      return {
        success: false,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: "",
        plan,
        generation: publicFailedGeneration(generation),
        execution: null,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, trace.warnings),
        assumptions: generation.assumptions,
        error,
      };
    }

    if (!shouldExecuteGeneratedSql()) {
      const execution = skippedExecution(generation);
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution));
      await this.finishTrace(trace, "success");
      return {
        success: true,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, execution.warnings, trace.warnings),
        assumptions: generation.assumptions,
      };
    }

    const executionStart = Date.now();
    let execution: Awaited<ReturnType<ErpSqlAgentExecutor["execute"]>>;
    try {
      execution = await this.executor.execute(generation, {
        accessScope: options.accessScope,
        module: intentResult.intent?.module ?? plan.modules[0]?.module,
        references: generation.references ?? referenceHints,
        financeMode: isFinancePlan(plan, intentResult) ? "strict" : undefined,
        signal: options.signal,
      });
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution, Date.now() - executionStart));
    } catch (error) {
      await this.recordFailure(trace, "executor", error);
      throw error;
    }

    const parsedExecution = SqlExecutionResultSchema.safeParse(execution);
    if (!parsedExecution.success) {
      const error = `SQL execution result schema validation failed: ${formatSchemaIssues(parsedExecution.error.issues)}`;
      await this.recordFailure(trace, "executor", error);
      await this.finishTrace(trace, "failed");
      return {
        success: false,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: generation.sql,
        plan,
        generation,
        execution: null,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, [error], trace.warnings),
        assumptions: generation.assumptions,
        error,
      };
    }

    const success = parsedExecution.data.valid && parsedExecution.data.executed;
    if (!success) {
      await this.recordFailure(trace, "executor", parsedExecution.data.error ?? "SQL execution failed.");
    }
    await this.finishTrace(trace, success ? "success" : "failed");

    return {
      success,
      traceId: trace.traceId,
      question: plan.question,
      intent: intentResult.intent,
      sql: generation.sql,
      plan,
      generation,
      execution: parsedExecution.data,
      warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, parsedExecution.data.warnings, trace.warnings),
      assumptions: generation.assumptions,
      error: parsedExecution.data.error,
    };
  }

  private async startTrace(question: string, options: ErpSqlAgentAskOptions): Promise<SqlTraceContext> {
    try {
      return await this.traceService.start(question, {
        ...options,
        rolloutMode: currentRolloutMode(),
      });
    } catch (error) {
      return {
        traceId: "trace-start-failed",
        question,
        startedAt: Date.now(),
        enabled: false,
        auditDegraded: true,
        warnings: [`AUDIT_DEGRADED: SQL trace write failed: ${error instanceof Error ? error.message : String(error)}`],
        sessionId: options.sessionId,
        runId: options.runId,
        ownerUserId: options.ownerUserId,
        rolloutMode: currentRolloutMode(),
      };
    }
  }

  private async recordTrace(trace: SqlTraceContext, write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      trace.warnings.push(`SQL trace write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async recordFailure(trace: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void> {
    await this.recordTrace(trace, () => this.traceService.recordFailure(trace, stage, error));
  }

  private async finishTrace(trace: SqlTraceContext, status: "success" | "failed"): Promise<void> {
    await this.recordTrace(trace, () => this.traceService.finish(trace, status));
  }

  private async extractIntent(question: string, signal?: AbortSignal): Promise<{
    intent?: Awaited<ReturnType<ErpSqlIntentExtractor["extract"]>>;
    warnings: string[];
  }> {
    if (!this.intentExtractor) return { warnings: [] };
    try {
      return { intent: await this.intentExtractor.extract(question, signal), warnings: [] };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return {
        warnings: [`Intent extraction failed; falling back to rule planner: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private async tryTemplateExecution(
    trace: SqlTraceContext,
    plan: QueryPlan,
    intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
    options: ErpSqlAgentAskOptions,
  ): Promise<ErpSqlAgentResult | undefined> {
    const slotResult = await slotsFromIntent(intentResult.intent, this.resolveCustomerName);
    throwIfAborted(options.signal);
    if (slotResult.ambiguity) {
      const error = formatCustomerAmbiguityError(slotResult.ambiguity.keyword, slotResult.ambiguity.candidates);
      const generation = blockedGeneration(plan, error, "customerClarificationRequired");
      await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
      await this.recordFailure(trace, "generator", error);
      await this.finishTrace(trace, "failed");
      return {
        success: false,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: "",
        plan,
        generation,
        execution: null,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, trace.warnings),
        assumptions: generation.assumptions,
        error,
        customerClarification: {
          status: "pending",
          keyword: slotResult.ambiguity.keyword,
          originalQuestion: plan.question,
          candidates: slotResult.ambiguity.candidates,
        },
      };
    }
    const slots = slotResult.slots;
    let candidates: ExecutableTemplateCandidate[];
    try {
      candidates = await this.templateRepository.findExecutableCandidates({
        question: plan.question,
        intent: intentResult.intent?.intentType,
        module: intentResult.intent?.module,
        slots,
        limit: 3,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      return undefined;
    }
    for (const candidate of candidates) {
      if (candidate.score < TEMPLATE_MATCH_THRESHOLD) continue;
      const params = bindTemplateParams(candidate, slots);
      if (!params) continue;
      const executionStart = Date.now();
      const templateExecution = await this.templateExecutor.execute({
        templateId: candidate.id,
        params,
        maxRows: intentResult.intent?.limit,
        accessScope: options.accessScope,
        module: candidate.module,
        signal: options.signal,
        runtimeContext: { question: plan.question, queryPlan: plan },
      });
      const generation = generationFromTemplate(candidate, templateExecution);
      const execution: SqlExecutionResult = { ...templateExecution, generation };
      await this.recordTrace(trace, () => this.traceService.recordGeneration(trace, generation));
      await this.recordTrace(trace, () => this.traceService.recordExecution(trace, execution, Date.now() - executionStart));
      const success = execution.valid && execution.executed;
      if (!success) await this.recordFailure(trace, "executor", execution.error ?? "SQL template execution failed.");
      await this.finishTrace(trace, success ? "success" : "failed");
      return {
        success,
        traceId: trace.traceId,
        question: plan.question,
        intent: intentResult.intent,
        sql: success ? generation.sql : "",
        plan,
        generation: success ? generation : publicFailedGeneration(generation),
        execution,
        warnings: merge(intentResult.warnings, plan.warnings, generation.warnings, execution.warnings, trace.warnings),
        assumptions: generation.assumptions,
        error: execution.error,
        template: {
          id: candidate.id.toString(),
          name: candidate.name,
          intent: candidate.intent,
          module: candidate.module,
          score: candidate.score,
        },
      };
    }
    return undefined;
  }

  private async findReferences(
    plan: QueryPlan,
    intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
    signal?: AbortSignal,
  ): Promise<SqlReferenceHint[]> {
    try {
      const common = {
        question: plan.question,
        intent: intentResult.intent?.intentType ?? plan.intent,
        module: isFinancePlan(plan, intentResult) ? "finance" : intentResult.intent?.module ?? plan.modules[0]?.module,
        signal,
      };
      const [metrics, datasets, families] = await Promise.all([
        common.module === "finance"
          ? this.templateRepository.findApprovedMetricCandidates({ ...common, limit: 3 })
          : Promise.resolve([]),
        this.templateRepository.findDatasetReferenceCandidates({ ...common, limit: 10 }),
        this.templateRepository.findReferenceCandidates({ ...common, limit: 3 }),
      ]);
      if (common.module === "finance" && metrics.length > 0) return metrics.map(mapMetricReference);
      return [...metrics.map(mapMetricReference), ...datasets.map(mapDatasetReference), ...families.map(mapFamilyReference)];
    } catch (error) {
      if (isAbortError(error)) throw error;
      return [];
    }
  }
}

function blockedResult(question: string, traceId: string, error: string, traceWarnings: string[]): ErpSqlAgentResult {
  const plan = {
    question,
    intent: "unknown",
    scenario: "generic",
    modules: [],
    schema: { result: { query: question, keywords: [], tables: [], fields: [], score: 0 }, selectedTables: [], selectedFields: [] },
    knowledge: {
      modules: [],
      joins: [],
      dateRules: { globalSafetyRange: { minExpression: "", maxExpression: "" }, moduleDateFields: [] },
      statusRules: [],
      qualityRules: { allowedCompanies: [], mustOutputCompany: true, rules: [], abnormalDateFields: [] },
      companyRules: { mustOutputCompany: true, mustJoinOnCompany: true, doNotDefaultSingleCompany: true },
      promptRules: { mode: "SELECT_ONLY", defaultLimit: 100, mustExplain: [], financialConclusionRequirement: "" },
    },
    constraints: {
      schemaName: "Erp",
      requireCompany: true,
      defaultLimit: 100,
      requiresDateSafetyRange: false,
      recommendedStatusFilters: [],
    },
    warnings: [],
    missingRequiredFields: [],
    confidence: 0,
  } satisfies QueryPlan;
  const generation = blockedGeneration(plan, error, "outOfScope");
  return {
    success: false,
    traceId,
    question,
    sql: "",
    plan,
    generation,
    execution: null,
    warnings: merge(generation.warnings, traceWarnings),
    assumptions: [],
    error,
  };
}

function mapMetricReference(reference: ApprovedMetricCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    metricCode: reference.metricCode,
    metricName: reference.metricName,
    businessDescription: reference.businessDescription,
    calculationSummary: reference.calculationSummary,
    definitionJson: reference.definitionJson,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    sourceType: "metric",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function mapDatasetReference(reference: DatasetReferenceCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    datasetId: reference.datasetId,
    reportName: reference.reportName,
    datasetName: reference.datasetName,
    fields: reference.fields,
    metrics: reference.metrics,
    questionText: reference.questionText,
    timeScope: reference.timeScope,
    businessScenario: reference.businessScenario,
    isFinance: reference.isFinance,
    verified: reference.verified,
    sqlPreview: reference.exampleSql,
    sourceType: "dataset",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function mapFamilyReference(reference: ReferenceFamilyCandidate): SqlReferenceHint {
  return {
    familyId: reference.familyId,
    businessDescription: reference.businessDescription,
    coreTables: reference.coreTables,
    joins: reference.joins,
    exampleSql: reference.exampleSql,
    sourceType: "family",
    score: reference.score,
    matchedSignals: reference.matchedSignals,
  };
}

function isFinancePlan(
  plan: QueryPlan,
  intentResult: Awaited<ReturnType<ErpSqlAgentService["extractIntent"]>>,
): boolean {
  return intentResult.intent?.module === "finance" || plan.modules.some((module) => module.module === "finance");
}

function blockedGeneration(plan: QueryPlan, error: string, scenario = "financeMetricRequired"): SqlGenerationResult {
  return {
    valid: false,
    source: "llm",
    scenario,
    sql: "",
    intent: plan.intent,
    tables: [],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: {
      valid: false,
      errors: [error],
      warnings: [],
      normalizedSql: "",
      referencedTables: [],
      referencedFields: [],
    },
  };
}

function skippedExecution(generation: SqlGenerationResult): SqlExecutionResult {
  return {
    valid: true,
    executed: false,
    sql: generation.sql,
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    warnings: [...generation.warnings, "Generated SQL was not executed because ERP_SQL_AGENT_EXECUTE_GENERATED_SQL is not true."],
    generation,
  };
}

async function slotsFromIntent(
  intent: Awaited<ReturnType<ErpSqlIntentExtractor["extract"]>> | undefined,
  resolveCustomerName: ErpSqlCustomerNameResolver,
): Promise<{ slots: Record<string, ErpSqlQueryValue>; ambiguity?: { keyword: string; candidates: ErpSqlCustomerCandidate[] } }> {
  if (!intent) return { slots: {} };
  const slots: Record<string, ErpSqlQueryValue> = {};
  for (const [key, value] of Object.entries(intent.entities)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") slots[key] = value;
  }
  const customerName = typeof slots.customerName === "string" && slots.customerName.trim() ? slots.customerName.trim() : inferCustomerName(intent);
  if (customerName) {
    const resolved = await resolveCustomerName(customerName);
    if (resolved && typeof resolved === "object" && resolved.status === "ambiguous") {
      return { slots, ambiguity: { keyword: resolved.keyword, candidates: resolved.candidates } };
    }
    slots.customerName = typeof resolved === "string" ? resolved : customerName;
  }
  if (intent.dateRange?.to) slots.dueBeforeDate = intent.dateRange.to;
  if (intent.dateRange?.from) slots.fromDate = intent.dateRange.from;
  if (intent.dateRange?.relativeDays) slots.relativeDays = intent.dateRange.relativeDays;
  applySalesRuleSlots(slots, intent.originalQuestion || intent.normalizedQuestion);
  return { slots };
}

function inferCustomerName(intent: Awaited<ReturnType<ErpSqlIntentExtractor["extract"]>>): string | undefined {
  const text = intent.normalizedQuestion || intent.originalQuestion;
  const match = text.match(/(?:客户|客戶)\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{1,24})\s*(?:的|订单|訂單|下单|下單|发货|發貨|还欠|還欠|完成|进度|進度)/u);
  return match?.[1];
}

function applySalesRuleSlots(slots: Record<string, ErpSqlQueryValue>, question: string): void {
  const orderNum = question.match(/(?:销售)?订单\s*([0-9]{3,})/u)?.[1];
  if (orderNum && slots.orderNum === undefined) slots.orderNum = Number(orderNum);
  const customerName = question.match(/客户\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{1,24})\s*(?:的|有|下|未发|待发|发货|还欠|订单)/u)?.[1];
  if (customerName && !isBadCustomerToken(customerName) && slots.customerName === undefined) slots.customerName = customerName;
  if (/发货通知|待发货|未发货|没发货|还没发货|欠发|欠交|未发完|通知发货/u.test(question)) {
    if (slots.onlyOpenRelease === undefined) slots.onlyOpenRelease = true;
    if (slots.onlyShippingNotice === undefined) slots.onlyShippingNotice = true;
  }
  if (/未关闭|打开的?订单|open/i.test(question) && slots.onlyOpen === undefined) slots.onlyOpen = true;
  if (/安全库存|库存不足|低于.*安全|最低安全线/u.test(question) && slots.onlyBelowSafety === undefined) slots.onlyBelowSafety = true;
  const contractNo = question.match(/(?:合同号?|合同)\s*([A-Z]{1,8}\d{4,})/iu)?.[1];
  if (contractNo && slots.contractNo === undefined) slots.contractNo = contractNo;
  const warehouse = question.match(/([A-Z]{2,}\d{2,})\s*仓库|仓库\s*([A-Z]{2,}\d{2,})/iu);
  if (warehouse && slots.warehouseCode === undefined) slots.warehouseCode = warehouse[1] ?? warehouse[2];
  const resourceGroupId = question.match(/资源(?:群)?组\s*([A-Z]{1,8}\d{1,})/iu)?.[1];
  if (resourceGroupId && slots.resourceGroupId === undefined) slots.resourceGroupId = resourceGroupId;
  const departmentName = question.match(/部门\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{1,12}?)(?=有|的|里|下|$)/u)?.[1];
  if (departmentName && slots.departmentName === undefined) slots.departmentName = departmentName;
  if (/加工中心/u.test(question) && slots.departmentName === undefined) slots.departmentName = "加工中心";
  if (/液压站/u.test(question) && slots.partDescription === undefined) slots.partDescription = "液压站";
  if (/缺.*料|未发.*料|还没发齐|没发齐|发齐|领.*料/u.test(question) && slots.onlyShortage === undefined) slots.onlyShortage = true;
  const minAgeDays = question.match(/超过\s*(\d+)\s*天/u)?.[1];
  if (minAgeDays && slots.minAgeDays === undefined) slots.minAgeDays = Number(minAgeDays);
  if (/库龄|呆滞|长期未动|超期|积压/u.test(question) && slots.onlyOnHand === undefined) slots.onlyOnHand = true;
}

function publicFailedGeneration(generation: SqlGenerationResult): SqlGenerationResult {
  const { candidateSql: _candidateSql, ...safe } = generation;
  return { ...safe, sql: "" };
}

function isBadCustomerToken(value: string): boolean {
  return /^(的|哪些|哪个|订单|客户|今年|去年|过去三年|近三年|本月|最近|产品|销售额|毛利|趋势)$/u.test(value.trim());
}

function bindTemplateParams(
  template: ExecutableTemplateCandidate,
  slots: Record<string, ErpSqlQueryValue>,
): Record<string, ErpSqlQueryValue> | undefined {
  const required = readParamNames(template.requiredParams);
  if (required.some((name) => slots[name] === undefined || slots[name] === null || slots[name] === "")) return undefined;
  const names = new Set([...required, ...readParamNames(template.optionalParams)]);
  return Object.fromEntries([...names].filter((name) => slots[name] !== undefined).map((name) => [name, slots[name]]));
}

function readParamNames(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function generationFromTemplate(
  template: ExecutableTemplateCandidate,
  execution: Awaited<ReturnType<TemplateExecutor["execute"]>>,
): SqlGenerationResult {
  const guardResult = execution.guardResult ?? {
    valid: execution.valid,
    errors: execution.error ? [execution.error] : [],
    warnings: execution.warnings,
    normalizedSql: execution.sql,
    referencedTables: readStringArray(template.tables),
    referencedFields: readStringArray(template.fields),
  };
  return {
    valid: execution.valid && guardResult.valid,
    source: "template",
    scenario: "template",
    sql: execution.valid && guardResult.valid ? execution.sql : "",
    candidateSql: execution.candidateSql,
    intent: template.intent,
    tables: readStringArray(template.tables),
    joins: readStringArray(template.joins),
    filters: [],
    assumptions: [`Executed approved SQL template ${template.id.toString()}.`],
    warnings: execution.warnings,
    guardResult,
    semanticResult: execution.semanticResult,
    references: [{
      familyId: String(template.sourceFamilyId ?? template.sourceDatasetId ?? template.id),
      businessDescription: template.name,
      coreTables: readStringArray(template.tables),
      joins: readStringArray(template.joins),
      exampleSql: execution.sql,
      sourceType: "template",
      score: template.score,
      matchedSignals: template.matchedSignals,
    }],
  };
}

function applySemanticResult(
  generation: SqlGenerationResult,
  semanticResult: ReturnType<typeof evaluateSqlSemantic>,
  devFullAccess = false,
): SqlGenerationResult {
  if (semanticResult.valid) return { ...generation, semanticResult };
  const candidateSql = generation.sql || generation.candidateSql || "";
  if (devFullAccess && process.env.NODE_ENV !== "production" && semanticResult.errors.every((error) => error.startsWith("semantic_mismatch:"))) {
    return {
      ...generation,
      valid: true,
      sql: candidateSql,
      candidateSql: undefined,
      semanticResult: { ...semanticResult, valid: true, status: "estimate" },
      warnings: merge(generation.warnings, [
        "DEV_SEMANTIC_MISMATCH_EXECUTED: SQL 结构合法但业务语义不匹配，此数据不准确，仅供参考。",
        ...semanticResult.errors,
      ]),
    };
  }
  return {
    ...generation,
    valid: false,
    sql: "",
    candidateSql,
    semanticResult,
    guardResult: {
      ...generation.guardResult,
      valid: false,
      errors: merge(generation.guardResult.errors, semanticResult.errors),
    },
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function merge(...items: string[][]): string[] {
  return [...new Set(items.flat())];
}

function formatCustomerAmbiguityError(keyword: string, candidates: ErpSqlCustomerCandidate[]): string {
  const options = candidates
    .map((candidate, index) => {
      const suffix = [candidate.shortName && `简称:${candidate.shortName}`, candidate.customerCode && `编码:${candidate.customerCode}`].filter(Boolean).join("，");
      return `${index + 1}. ${candidate.customerName}${suffix ? `（${suffix}）` : ""}`;
    })
    .join("；");
  return `客户“${keyword}”匹配到多个候选，请先确认是哪一个：${options}`;
}

function formatSchemaIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

function createDefaultIntentExtractor(): ErpSqlIntentExtractor | undefined {
  return process.env.ERP_SQL_AGENT_INTENT_ENABLED === "false" ? undefined : deepSeekIntentExtractor;
}

function shouldExecuteGeneratedSql(): boolean {
  return process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL === "true";
}

function currentRolloutMode(): string {
  return shouldExecuteGeneratedSql() ? "generated_sql_execute" : GENERATED_SQL_ROLLOUT_MODE;
}

export const erpSqlAgentService = new ErpSqlAgentService(
  sqlPlannerService,
  sqlGeneratorService,
  sqlExecutorService,
  createDefaultIntentExtractor(),
  sqlTraceService,
  sqlTemplateRepository,
  sqlTemplateExecutionService,
  resolveJdyCrmCustomerName,
  true,
);
