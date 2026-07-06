import assert from "node:assert/strict";
import test from "node:test";
import {
  ErpSqlAgentService,
  type ErpSqlAgentExecutor,
  type ErpSqlAgentGenerator,
  type ErpSqlAgentPlanner,
  type ErpSqlIntentExtractor,
} from "../../src/features/erpSqlAgent/agent/index.js";
import type { SqlExecutionResult } from "../../src/features/erpSqlAgent/executor/index.js";
import type { SqlGenerationResult } from "../../src/features/erpSqlAgent/generator/index.js";
import type { ErpSqlIntent } from "../../src/features/erpSqlAgent/intent/index.js";
import type { QueryPlan } from "../../src/features/erpSqlAgent/planner/index.js";
import {
  SqlTraceService,
  type SqlTraceContext,
  type SqlTraceRepository,
  type SqlTraceRepositoryCreateInput,
  type SqlTraceRepositoryUpdateInput,
  type SqlTraceStage,
  type SqlTraceStatus,
  type SqlTraceWriter,
} from "../../src/features/erpSqlAgent/trace/index.js";

class FakePlanner implements ErpSqlAgentPlanner {
  readonly calls: Array<{ question: string; intent?: ErpSqlIntent }> = [];

  constructor(private readonly result: QueryPlan = makePlan()) {}

  async plan(question: string, intent?: ErpSqlIntent): Promise<QueryPlan> {
    this.calls.push({ question, intent });
    return { ...this.result, question, extractedIntent: intent };
  }
}

class FakeGenerator implements ErpSqlAgentGenerator {
  constructor(private readonly result: SqlGenerationResult = makeGeneration()) {}

  async generate(): Promise<SqlGenerationResult> {
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

  async start(question: string): Promise<SqlTraceContext> {
    if (this.throwOnStart) throw new Error("trace down");
    return {
      traceId: "00000000-0000-4000-8000-000000000001",
      question,
      startedAt: Date.now(),
      enabled: true,
      warnings: [],
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

function makeIntent(): ErpSqlIntent {
  return {
    originalQuestion: "查询物料 A123 的库存",
    normalizedQuestion: "查询物料 A123 的库存",
    module: "inventory",
    intentType: "detail",
    entities: {
      partNum: "A123",
    },
    confidence: 0.9,
    warnings: [],
  };
}

function makePlan(warnings: string[] = ["plan warning"]): QueryPlan {
  return {
    question: "查询采购订单",
    intent: "list",
    scenario: "purchaseDetail",
    modules: [],
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
