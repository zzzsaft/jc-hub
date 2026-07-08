import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  ErpSqlAgentService,
  type ErpSqlAgentExecutor,
  type ErpSqlAgentGenerator,
  type ErpSqlAgentPlanner,
  type ErpSqlIntentExtractor,
} from "../../src/modules/erpSqlAgent/agent/index.js";
import type { SqlExecutionResult } from "../../src/modules/erpSqlAgent/executor/index.js";
import type { SqlGenerationResult, SqlGeneratorPlan } from "../../src/modules/erpSqlAgent/generator/index.js";
import type { ErpSqlIntent } from "../../src/modules/erpSqlAgent/intent/index.js";
import type { ErpModuleName } from "../../src/modules/erpSqlAgent/knowledge/index.js";
import type { QueryPlan } from "../../src/modules/erpSqlAgent/planner/index.js";
import type {
  ApprovedMetricCandidate,
  DatasetReferenceCandidate,
  ExecutableTemplateCandidate,
  ReferenceFamilyCandidate,
} from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import type { TemplateExecutionResult } from "../../src/modules/erpSqlAgent/templates/types/SqlTemplateTypes.js";
import {
  SqlTraceService,
  type SqlTraceContext,
  type SqlTraceRepository,
  type SqlTraceRepositoryCreateInput,
  type SqlTraceRepositoryUpdateInput,
  type SqlTraceStage,
  type SqlTraceStatus,
  type SqlTraceWriter,
} from "../../src/modules/erpSqlAgent/trace/index.js";

const ORIGINAL_EXECUTE_GENERATED_SQL = process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;

beforeEach(() => {
  process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = "true";
});

afterEach(() => {
  if (ORIGINAL_EXECUTE_GENERATED_SQL === undefined) {
    delete process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
  } else {
    process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL = ORIGINAL_EXECUTE_GENERATED_SQL;
  }
});

class FakePlanner implements ErpSqlAgentPlanner {
  readonly calls: Array<{ question: string; intent?: ErpSqlIntent }> = [];

  constructor(private readonly result: QueryPlan = makePlan()) {}

  async plan(question: string, intent?: ErpSqlIntent): Promise<QueryPlan> {
    this.calls.push({ question, intent });
    return { ...this.result, question, extractedIntent: intent };
  }
}

class FakeGenerator implements ErpSqlAgentGenerator {
  calls = 0;
  readonly plans: SqlGeneratorPlan[] = [];

  constructor(private readonly result: SqlGenerationResult = makeGeneration()) {}

  async generate(plan: SqlGeneratorPlan): Promise<SqlGenerationResult> {
    this.calls += 1;
    this.plans.push(plan);
    return this.result;
  }
}

class FakeExecutor implements ErpSqlAgentExecutor {
  readonly calls: SqlGenerationResult[] = [];

  constructor(private readonly result?: SqlExecutionResult) {}

  async execute(generation: SqlGenerationResult): Promise<SqlExecutionResult> {
    this.calls.push(generation);
    return this.result ?? makeExecution(generation);
  }
}

class FakeIntentExtractor implements ErpSqlIntentExtractor {
  constructor(private readonly result: ErpSqlIntent = makeIntent(), private readonly error?: Error) {}

  async extract(): Promise<ErpSqlIntent> {
    if (this.error) throw this.error;
    return this.result;
  }
}

class FakeTraceService implements SqlTraceWriter {
  readonly plans: QueryPlan[] = [];
  readonly generations: SqlGenerationResult[] = [];
  readonly executions: SqlExecutionResult[] = [];
  readonly failures: Array<{ stage: SqlTraceStage; error: unknown }> = [];
  readonly finishes: SqlTraceStatus[] = [];

  constructor(private readonly throwOnWrite = false, private readonly throwOnStart = false) {}

  async start(question: string, options: { sessionId?: string; runId?: string; ownerUserId?: string | null; rolloutMode?: string } = {}): Promise<SqlTraceContext> {
    if (this.throwOnStart) throw new Error("trace down");
    return {
      traceId: "00000000-0000-4000-8000-000000000001",
      question,
      startedAt: Date.now(),
      enabled: true,
      warnings: [],
      ...options,
    };
  }

  async recordPlan(_: SqlTraceContext, plan: QueryPlan): Promise<void> {
    this.throwMaybe();
    this.plans.push(plan);
  }

  async recordGeneration(_: SqlTraceContext, generation: SqlGenerationResult): Promise<void> {
    this.throwMaybe();
    this.generations.push(generation);
  }

  async recordExecution(_: SqlTraceContext, execution: SqlExecutionResult): Promise<void> {
    this.throwMaybe();
    this.executions.push(execution);
  }

  async recordFailure(_: SqlTraceContext, stage: SqlTraceStage, error: unknown): Promise<void> {
    this.throwMaybe();
    this.failures.push({ stage, error });
  }

  async finish(_: SqlTraceContext, status: SqlTraceStatus): Promise<void> {
    this.throwMaybe();
    this.finishes.push(status);
  }

  private throwMaybe(): void {
    if (this.throwOnWrite) throw new Error("trace write down");
  }
}

class FakeTraceRepository implements SqlTraceRepository {
  readonly creates: SqlTraceRepositoryCreateInput[] = [];
  readonly updates: Array<{ traceId: string; input: SqlTraceRepositoryUpdateInput }> = [];

  async create(input: SqlTraceRepositoryCreateInput): Promise<void> {
    this.creates.push(input);
  }

  async update(traceId: string, input: SqlTraceRepositoryUpdateInput): Promise<void> {
    this.updates.push({ traceId, input });
  }
}

class FakeTemplateRepository {
  readonly datasetInputs: unknown[] = [];

  constructor(
    private readonly candidates: ExecutableTemplateCandidate[] = [],
    private readonly datasetReferences: DatasetReferenceCandidate[] = [],
    private readonly familyReferences: ReferenceFamilyCandidate[] = [],
    private readonly metricReferences: ApprovedMetricCandidate[] = [],
  ) {}

  async findExecutableCandidates(): Promise<ExecutableTemplateCandidate[]> {
    return this.candidates;
  }

  async findDatasetReferenceCandidates(input: unknown): Promise<DatasetReferenceCandidate[]> {
    this.datasetInputs.push(input);
    return this.datasetReferences;
  }

  async findReferenceCandidates(): Promise<ReferenceFamilyCandidate[]> {
    return this.familyReferences;
  }

  async findApprovedMetricCandidates(): Promise<ApprovedMetricCandidate[]> {
    return this.metricReferences;
  }
}

class FakeTemplateExecutor {
  readonly calls: Array<{ templateId: bigint; params: Record<string, unknown> }> = [];

  async execute(input: { templateId: bigint; params: Record<string, unknown> }): Promise<TemplateExecutionResult> {
    this.calls.push(input);
    return {
      executed: true,
      valid: true,
      sql: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
      fields: ["Company", "PartNum"],
      rows: [["jctimes", "A123"]],
      rowCount: 1,
      truncated: false,
      warnings: [],
    };
  }
}

test("ask runs planner, generator, and executor", async () => {
  const executor = new FakeExecutor();
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), executor);

  const result = await service.ask("查询采购订单");

  assert.equal(executor.calls.length, 1);
  assert.equal(result.success, true);
  assert.equal(typeof result.traceId, "string");
  assert.equal(result.sql, "SELECT Company FROM Erp.POHeader");
  assert.equal(result.execution?.executed, true);
});

test("invalid generation does not call executor", async () => {
  const executor = new FakeExecutor();
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(makeGeneration(false)), executor);

  const result = await service.ask("危险 SQL");

  assert.equal(executor.calls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.execution, null);
  assert.match(result.error ?? "", /blocked/);
});

test("executor failure returns success false", async () => {
  const generation = makeGeneration();
  const executor = new FakeExecutor(makeExecution(generation, false, "backend down"));
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(generation), executor);

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, false);
  assert.equal(result.execution?.valid, false);
  assert.equal(result.error, "backend down");
});

test("invalid executor result schema returns success false", async () => {
  const generation = makeGeneration();
  const invalidExecution = {
    ...makeExecution(generation),
    rowCount: "1",
  } as unknown as SqlExecutionResult;
  const service = new ErpSqlAgentService(
    new FakePlanner(),
    new FakeGenerator(generation),
    new FakeExecutor(invalidExecution),
  );

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, false);
  assert.equal(result.execution, null);
  assert.match(result.error ?? "", /SQL execution result schema validation failed/);
  assert.match(result.error ?? "", /rowCount/);
});

test("warnings and assumptions are merged", async () => {
  const generation = makeGeneration(true, ["plan warning", "generator warning"], ["needs Company"]);
  const executor = new FakeExecutor(makeExecution(generation, true, undefined, ["executor warning"]));
  const service = new ErpSqlAgentService(new FakePlanner(makePlan(["plan warning"])), new FakeGenerator(generation), executor);

  const result = await service.ask("查询采购订单");

  assert.deepEqual(result.warnings, ["plan warning", "generator warning", "executor warning"]);
  assert.deepEqual(result.assumptions, ["needs Company"]);
});

test("ask returns SQL, plan, and execution details", async () => {
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), new FakeExecutor());

  const result = await service.ask("查询采购订单");

  assert.equal(result.plan.intent, "list");
  assert.equal(result.generation.sql, "SELECT Company FROM Erp.POHeader");
  assert.equal(result.execution?.rowCount, 1);
  assert.deepEqual(result.execution?.fields, ["Company"]);
});

test("intent extractor result is passed to planner", async () => {
  const planner = new FakePlanner();
  const service = new ErpSqlAgentService(planner, new FakeGenerator(), new FakeExecutor(), new FakeIntentExtractor());

  const result = await service.ask("查询物料 A123 的库存");

  assert.equal(planner.calls[0]?.intent?.entities.partNum, "A123");
  assert.equal(result.intent?.module, "inventory");
  assert.equal(result.plan.extractedIntent?.entities.partNum, "A123");
});

test("intent extractor failure falls back to rule planner", async () => {
  const planner = new FakePlanner();
  const service = new ErpSqlAgentService(
    planner,
    new FakeGenerator(),
    new FakeExecutor(),
    new FakeIntentExtractor(makeIntent(), new Error("bad json")),
  );

  const result = await service.ask("查询采购订单");

  assert.equal(planner.calls[0]?.intent, undefined);
  assert.equal(result.success, true);
  assert(result.warnings.some((warning) => warning.includes("Intent extraction failed")));
});

test("approved template match executes template and skips generator", async () => {
  const generator = new FakeGenerator();
  const templateExecutor = new FakeTemplateExecutor();
  const service = new ErpSqlAgentService(
    new FakePlanner(),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(),
    new FakeTraceService(),
    new FakeTemplateRepository([makeTemplateCandidate()]),
    templateExecutor,
  );

  const result = await service.ask("查询物料 A123 的库存");

  assert.equal(generator.calls, 0);
  assert.equal(templateExecutor.calls.length, 1);
  assert.equal(templateExecutor.calls[0]?.params.partNum, "A123");
  assert.equal(result.success, true);
  assert.equal(result.generation.source, "template");
  assert.equal(result.template?.id, "1");
});

test("template missing required params falls back to generator", async () => {
  const generator = new FakeGenerator();
  const templateExecutor = new FakeTemplateExecutor();
  const service = new ErpSqlAgentService(
    new FakePlanner(),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(),
    new FakeTraceService(),
    new FakeTemplateRepository([makeTemplateCandidate({ requiredParams: { warehouseCode: { required: true } } })]),
    templateExecutor,
  );

  const result = await service.ask("查询物料 A123 的库存");

  assert.equal(templateExecutor.calls.length, 0);
  assert.equal(generator.calls, 1);
  assert.equal(result.generation.source, undefined);
});

test("fallback generation receives dataset SQL references", async () => {
  const generator = new FakeGenerator();
  const repository = new FakeTemplateRepository([], [makeDatasetReference()], [makeFamilyReference()]);
  const service = new ErpSqlAgentService(
    new FakePlanner(),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(),
    new FakeTraceService(),
    repository,
    new FakeTemplateExecutor(),
  );

  const result = await service.ask("查本月收入和税额");

  assert.equal(result.success, true);
  assert.equal(repository.datasetInputs.length, 1);
  assert.equal((repository.datasetInputs[0] as { limit?: number }).limit, 10);
  assert.equal(generator.plans[0]?.references?.[0]?.datasetId, "101");
  assert.deepEqual(generator.plans[0]?.references?.[0]?.metrics, ["收入", "税额"]);
  assert.equal(generator.plans[0]?.references?.[0]?.score, 1);
  assert.deepEqual(generator.plans[0]?.references?.[0]?.matchedSignals, ["finance", "metric:收入"]);
  assert.equal(generator.plans[0]?.references?.[1]?.sourceType, "family");
  assert.equal(generator.plans[0]?.references?.[1]?.score, 0.8);
});

test("generated SQL is observed but not executed when rollout execution is disabled", async () => {
  delete process.env.ERP_SQL_AGENT_EXECUTE_GENERATED_SQL;
  const executor = new FakeExecutor();
  const trace = new FakeTraceService();
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), executor, undefined, trace);

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, true);
  assert.equal(executor.calls.length, 0);
  assert.equal(result.execution?.valid, true);
  assert.equal(result.execution?.executed, false);
  assert(result.warnings.some((warning) => warning.includes("not executed")));
  assert.equal(trace.executions.length, 1);
  assert.deepEqual(trace.finishes, ["success"]);
});

test("finance without approved template or metric does not call generator", async () => {
  const generator = new FakeGenerator();
  const service = new ErpSqlAgentService(
    new FakePlanner(makePlan([], "finance")),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(makeIntent("finance")),
    new FakeTraceService(),
    new FakeTemplateRepository(),
    new FakeTemplateExecutor(),
  );

  const result = await service.ask("查本月收入");

  assert.equal(result.success, false);
  assert.equal(generator.calls, 0);
  assert.equal(result.execution, null);
  assert.match(result.error ?? "", /approved business metric/);
});

test("planner finance signal blocks generation even when intent extractor picks sales", async () => {
  const generator = new FakeGenerator();
  const service = new ErpSqlAgentService(
    new FakePlanner(makePlan([], "finance")),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(makeIntent("sales")),
    new FakeTraceService(),
    new FakeTemplateRepository(),
    new FakeTemplateExecutor(),
  );

  const result = await service.ask("检查6月份产品，价值比较高的5种，毛利是多少，成本占比最大的是什么，都是哪些客户。");

  assert.equal(result.success, false);
  assert.equal(generator.calls, 0);
  assert.match(result.error ?? "", /approved business metric/);
});

test("finance with approved metric calls generator with metric reference only", async () => {
  const generator = new FakeGenerator();
  const service = new ErpSqlAgentService(
    new FakePlanner(makePlan([], "finance")),
    generator,
    new FakeExecutor(),
    new FakeIntentExtractor(makeIntent("finance")),
    new FakeTraceService(),
    new FakeTemplateRepository([], [makeDatasetReference()], [makeFamilyReference()], [makeMetricReference()]),
    new FakeTemplateExecutor(),
  );

  const result = await service.ask("查本月收入");

  assert.equal(result.success, true);
  assert.equal(generator.calls, 1);
  assert.equal(generator.plans[0]?.references?.length, 1);
  assert.equal(generator.plans[0]?.references?.[0]?.sourceType, "metric");
  assert.equal(generator.plans[0]?.references?.[0]?.metricCode, "finance_revenue");
});

test("ask writes trace on success", async () => {
  const trace = new FakeTraceService();
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), new FakeExecutor(), undefined, trace);

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, true);
  assert.equal(result.traceId, "00000000-0000-4000-8000-000000000001");
  assert.equal(trace.plans.length, 1);
  assert.equal(trace.generations.length, 1);
  assert.equal(trace.executions.length, 1);
  assert.deepEqual(trace.finishes, ["success"]);
});

test("invalid generation writes failed trace and skips executor", async () => {
  const trace = new FakeTraceService();
  const executor = new FakeExecutor();
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(makeGeneration(false)), executor, undefined, trace);

  const result = await service.ask("危险 SQL");

  assert.equal(result.success, false);
  assert.equal(executor.calls.length, 0);
  assert.equal(trace.failures[0]?.stage, "generator");
  assert.deepEqual(trace.finishes, ["failed"]);
});

test("executor failure writes failed trace", async () => {
  const generation = makeGeneration();
  const trace = new FakeTraceService();
  const service = new ErpSqlAgentService(
    new FakePlanner(),
    new FakeGenerator(generation),
    new FakeExecutor(makeExecution(generation, false, "backend down")),
    undefined,
    trace,
  );

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, false);
  assert.equal(trace.executions.length, 1);
  assert.equal(trace.failures[0]?.stage, "executor");
  assert.deepEqual(trace.finishes, ["failed"]);
});

test("trace service errors do not fail ask", async () => {
  const trace = new FakeTraceService(true);
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), new FakeExecutor(), undefined, trace);

  const result = await service.ask("查询采购订单");

  assert.equal(result.success, true);
  assert(result.warnings.some((warning) => warning.includes("SQL trace write failed")));
});

test("trace disabled does not write", async () => {
  const previous = process.env.ERP_SQL_AGENT_TRACE_ENABLED;
  process.env.ERP_SQL_AGENT_TRACE_ENABLED = "false";
  const repository = new FakeTraceRepository();
  const trace = new SqlTraceService(repository);
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), new FakeExecutor(), undefined, trace);

  try {
    const result = await service.ask("查询采购订单");

    assert.equal(result.success, true);
    assert.equal(repository.creates.length, 0);
    assert.equal(repository.updates.length, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.ERP_SQL_AGENT_TRACE_ENABLED;
    } else {
      process.env.ERP_SQL_AGENT_TRACE_ENABLED = previous;
    }
  }
});

test("trace writes rollout runtime metadata", async () => {
  const previousTrace = process.env.ERP_SQL_AGENT_TRACE_ENABLED;
  process.env.ERP_SQL_AGENT_TRACE_ENABLED = "true";
  const repository = new FakeTraceRepository();
  const trace = new SqlTraceService(repository);
  const service = new ErpSqlAgentService(new FakePlanner(), new FakeGenerator(), new FakeExecutor(), undefined, trace);

  try {
    await service.ask("查询采购订单", {
      sessionId: "12",
      runId: "34",
      ownerUserId: "u1",
    });

    assert.equal(repository.creates[0]?.sessionId, "12");
    assert.equal(repository.creates[0]?.runId, "34");
    assert.equal(repository.creates[0]?.ownerUserId, "u1");
    assert.equal(repository.creates[0]?.rolloutMode, "generated_sql_execute");
  } finally {
    if (previousTrace === undefined) {
      delete process.env.ERP_SQL_AGENT_TRACE_ENABLED;
    } else {
      process.env.ERP_SQL_AGENT_TRACE_ENABLED = previousTrace;
    }
  }
});

test("trace execution snapshot does not store full rows", async () => {
  const previous = process.env.ERP_SQL_AGENT_TRACE_ENABLED;
  process.env.ERP_SQL_AGENT_TRACE_ENABLED = "true";
  const repository = new FakeTraceRepository();
  const trace = new SqlTraceService(repository);
  const generation = makeGeneration();

  try {
    const context = await trace.start("查询采购订单");
    await trace.recordExecution(context, {
      ...makeExecution(generation),
      rows: [["1"], ["2"], ["3"], ["4"], ["5"], ["6"]],
      rowCount: 6,
    });

    assert.equal(repository.creates.length, 1);
    assert.equal(repository.updates[0]?.input.execution?.rowCount, 6);
    assert.equal(repository.updates[0]?.input.execution?.previewRows?.length, 5);
    assert.equal("rows" in (repository.updates[0]?.input.execution ?? {}), false);
  } finally {
    if (previous === undefined) {
      delete process.env.ERP_SQL_AGENT_TRACE_ENABLED;
    } else {
      process.env.ERP_SQL_AGENT_TRACE_ENABLED = previous;
    }
  }
});

function makeIntent(module: ErpSqlIntent["module"] = "inventory"): ErpSqlIntent {
  return {
    originalQuestion: "查询物料 A123 的库存",
    normalizedQuestion: "查询物料 A123 的库存",
    module,
    intentType: "detail",
    entities: {
      partNum: "A123",
    },
    confidence: 0.9,
    warnings: [],
  };
}

function makePlan(warnings: string[] = ["plan warning"], module?: ErpModuleName): QueryPlan {
  return {
    question: "查询采购订单",
    intent: "list",
    scenario: "purchaseDetail",
    modules: module ? [{
      module,
      label: module,
      score: 1,
      reasons: ["test"],
      rule: { module, label: module, description: "test", coreTables: [], keywords: [] },
    }] : [],
    schema: {
      result: {
        query: "查询采购订单",
        keywords: ["采购"],
        tables: [],
        fields: [],
        score: 100,
      },
      selectedTables: [
        {
          schemaName: "Erp",
          tableName: "POHeader",
          label: "POHeader",
          score: 100,
          source: "retriever",
        },
      ],
      selectedFields: [],
    },
    knowledge: {
      modules: [],
      joins: [],
      dateRules: {
        globalSafetyRange: {
          minExpression: "日期字段 >= '20000101'",
          maxExpression: "日期字段 < DATEADD(year, 1, CAST(GETDATE() AS date))",
        },
        moduleDateFields: [],
      },
      statusRules: [],
      qualityRules: {
        allowedCompanies: [],
        mustOutputCompany: true,
        rules: [],
        abnormalDateFields: [],
      },
      companyRules: {
        mustOutputCompany: true,
        mustJoinOnCompany: true,
        doNotDefaultSingleCompany: true,
      },
      promptRules: {
        mode: "SELECT_ONLY",
        defaultLimit: 100,
        mustExplain: [],
        financialConclusionRequirement: "",
      },
    },
    constraints: {
      schemaName: "Erp",
      requireCompany: true,
      defaultLimit: 100,
      requiresDateSafetyRange: false,
      recommendedStatusFilters: [],
    },
    warnings,
    missingRequiredFields: [],
    confidence: 1,
  };
}

function makeGeneration(
  valid = true,
  warnings: string[] = ["generator warning"],
  assumptions: string[] = [],
): SqlGenerationResult {
  return {
    valid,
    sql: "SELECT Company FROM Erp.POHeader",
    intent: "list",
    tables: ["Erp.POHeader"],
    joins: [],
    filters: [],
    assumptions,
    warnings,
    guardResult: {
      valid,
      errors: valid ? [] : ["blocked"],
      warnings: [],
      normalizedSql: "SELECT Company FROM Erp.POHeader",
      referencedTables: ["Erp.POHeader"],
      referencedFields: ["Company"],
    },
  };
}

function makeExecution(
  generation: SqlGenerationResult,
  valid = true,
  error?: string,
  warnings: string[] = generation.warnings,
): SqlExecutionResult {
  return {
    valid,
    executed: valid,
    sql: generation.sql,
    fields: valid ? ["Company"] : [],
    rows: valid ? [["jctimes"]] : [],
    rowCount: valid ? 1 : 0,
    truncated: false,
    warnings,
    error,
    generation,
  };
}

function makeTemplateCandidate(overrides: Partial<ExecutableTemplateCandidate> = {}): ExecutableTemplateCandidate {
  return {
    id: 1n,
    name: "库存查询",
    intent: "inventory_stock_lookup",
    module: "inventory",
    questionPattern: "查询物料库存",
    normalizedQuestion: "库存查询",
    queryPlanJson: {},
    sqlTemplate: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
    requiredParams: { partNum: { required: true } },
    optionalParams: {},
    tables: ["Erp.Part"],
    fields: ["Company", "PartNum"],
    joins: [],
    sourceType: "manual",
    sourceDatasetId: null,
    sourceReportName: null,
    sourceSqlHash: null,
    sourceFamilyId: null,
    sourceDatasetIds: [],
    sourceReportNames: [],
    sourceSqlHashes: [],
    notes: null,
    guardPassed: true,
    approved: true,
    approvalStatus: "approved",
    approvedBy: "tester",
    approvedAt: new Date(),
    usageCount: 0,
    successCount: 0,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    score: 0.9,
    matchedSignals: ["slot:partNum"],
    ...overrides,
  } as ExecutableTemplateCandidate;
}

function makeDatasetReference(overrides: Partial<DatasetReferenceCandidate> = {}): DatasetReferenceCandidate {
  return {
    datasetId: "101",
    familyId: "finance_income",
    businessDescription: "财务收入税额参考",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    exampleSql: "SELECT Company, SUM(DocInvoiceAmt) AS 收入 FROM Erp.InvcHead GROUP BY Company",
    reportName: "收入报表",
    datasetName: "ds_income",
    fields: ["Company", "DocInvoiceAmt"],
    metrics: ["收入", "税额"],
    questionText: "查询收入税额",
    timeScope: "本月",
    businessScenario: "财务收入统计",
    isFinance: true,
    verified: false,
    sourceType: "dataset",
    score: 1,
    matchedSignals: ["finance", "metric:收入"],
    ...overrides,
  };
}

function makeFamilyReference(overrides: Partial<ReferenceFamilyCandidate> = {}): ReferenceFamilyCandidate {
  return {
    familyId: "finance_income",
    businessDescription: "财务收入 family",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    exampleSql: "SELECT Company FROM Erp.InvcHead",
    score: 0.8,
    matchedSignals: ["finance"],
    ...overrides,
  };
}

function makeMetricReference(overrides: Partial<ApprovedMetricCandidate> = {}): ApprovedMetricCandidate {
  return {
    familyId: "finance_income",
    metricCode: "finance_revenue",
    metricName: "收入",
    businessDescription: "财务收入指标",
    calculationSummary: "按发票确认收入",
    coreTables: ["Erp.InvcHead"],
    joins: [],
    params: ["fromDate", "toDate"],
    definitionJson: {
      amountExpression: "InvcHead.DocInvoiceAmt",
      timeField: "InvcHead.InvoiceDate",
      statusFilter: "InvcHead.Posted = 1",
      taxPolicy: "tax_included",
      refundPolicy: "deduct_credit_memo",
      exclusions: ["void invoices"],
    },
    exampleSql: "SELECT Company, SUM(DocInvoiceAmt) AS 收入 FROM Erp.InvcHead GROUP BY Company",
    score: 1,
    matchedSignals: ["module:finance", "收入"],
    ...overrides,
  };
}
