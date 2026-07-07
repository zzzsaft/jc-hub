import assert from "node:assert/strict";
import test from "node:test";
import { agentRuntimeService } from "../../src/ai/agentRuntime/defaultRuntime.js";
import { agentRuntimeMastraErpSqlHandler } from "../../src/modules/erpSqlAgent/agent/mastraRuntimeHandler.js";
import { erpSqlAgentService } from "../../src/modules/erpSqlAgent/agent/index.js";
import { resultNarratorService } from "../../src/modules/erpSqlAgent/agent/service/ResultNarratorService.js";
import { sqlExecutorService } from "../../src/modules/erpSqlAgent/executor/index.js";
import { sqlGeneratorService } from "../../src/modules/erpSqlAgent/generator/index.js";
import { deepSeekIntentExtractor } from "../../src/modules/erpSqlAgent/intent/index.js";
import { sqlPlannerService } from "../../src/modules/erpSqlAgent/planner/index.js";
import { sqlGuardService } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateRepository } from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import { sqlTemplateExecutionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";
import { runErpSqlAskTool } from "../../src/ai/mastra/tools/erpSqlAsk.tool.js";
import {
  runExtractSqlIntentTool,
  runPlanSqlQueryTool,
} from "../../src/ai/mastra/tools/erpSql/toolchain.tools.js";
import { runErpSqlToolchainWorkflow } from "../../src/ai/mastra/workflows/erpSqlToolchain.workflow.js";

test("legacy Mastra ERP SQL tool maps existing agent output", async () => {
  const originalAsk = erpSqlAgentService.ask;
  (erpSqlAgentService as any).ask = async (question: string) => ({
    success: true,
    traceId: "trace-1",
    question,
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    plan: { intent: "list" },
    generation: {},
    execution: {
      fields: ["Company"],
      rows: [["jctimes"]],
      rowCount: 1,
      truncated: false,
    },
    warnings: ["warn"],
    assumptions: [],
    template: {
      id: "7",
      name: "采购订单",
      intent: "detail",
      module: "purchase",
      score: 0.9,
    },
  });

  try {
    const result = await runErpSqlAskTool({ question: "查询采购订单" });

    assert.equal(result.success, true);
    assert.equal(result.traceId, "trace-1");
    assert.equal(result.rowCount, 1);
    assert.equal(result.template?.id, "7");
  } finally {
    (erpSqlAgentService as any).ask = originalAsk;
  }
});

test("extractSqlIntentTool degrades to warnings", async () => {
  const originalExtract = deepSeekIntentExtractor.extract;
  (deepSeekIntentExtractor as any).extract = async () => {
    throw new Error("llm down");
  };

  try {
    const result = await runExtractSqlIntentTool("查询采购订单");

    assert.equal(result.intent, undefined);
    assert.match(result.warnings[0], /llm down/);
  } finally {
    (deepSeekIntentExtractor as any).extract = originalExtract;
  }
});

test("planSqlQueryTool passes extracted intent to planner", async () => {
  const originalPlan = sqlPlannerService.plan;
  let receivedIntent: unknown;
  (sqlPlannerService as any).plan = async (_question: string, intent: unknown) => {
    receivedIntent = intent;
    return makePlan();
  };

  try {
    const intent = makeIntent();
    const result = await runPlanSqlQueryTool("查询采购订单", intent);

    assert.equal(receivedIntent, intent);
    assert.equal(result.plan.question, "查询采购订单");
  } finally {
    (sqlPlannerService as any).plan = originalPlan;
  }
});

test("ERP SQL toolchain workflow runs generate, validate, execute, and narrate path", async () => {
  const restore = stubToolchain({ narrate: true });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询采购订单", confirmed: true });

    assert.equal(result.success, true);
    assert.equal(result.sql, "SELECT TOP 100 Company FROM Erp.POHeader");
    assert.equal(result.rowCount, 1);
    assert.equal(result.message, "查询到 1 行。\n- 公司为 jctimes\n- 仅基于返回样本说明");
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow uses template path without generator", async () => {
  let generatorCalls = 0;
  const restore = stubToolchain({
    template: true,
    onGenerate() {
      generatorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询物料 A123" });

    assert.equal(result.success, true);
    assert.equal(result.template?.id, "9");
    assert.equal(result.rowCount, 1);
    assert.equal(generatorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow does not execute invalid generated SQL", async () => {
  let executorCalls = 0;
  const restore = stubToolchain({
    invalidGuard: true,
    onExecute() {
      executorCalls += 1;
    },
  });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "危险 SQL" });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /blocked/);
    assert.equal(executorCalls, 0);
  } finally {
    restore();
  }
});

test("ERP SQL toolchain workflow keeps success when narrator fails", async () => {
  const restore = stubToolchain({ narratorThrows: true });

  try {
    const result = await runErpSqlToolchainWorkflow({ question: "查询采购订单" });

    assert.equal(result.success, true);
    assert.equal(result.analysis, null);
    assert.equal(result.message, "已生成并执行 SQL，返回 1 行。");
  } finally {
    restore();
  }
});

test("default runtime registers parallel Mastra ERP SQL handler", () => {
  assert.equal((agentRuntimeService as any).handlers.has("mastraErpSqlAgent"), true);
});

test("Mastra ERP SQL runtime handler returns fine-grained tool trace", async () => {
  const restore = stubToolchain({ narratorThrows: true });

  try {
    const toolTrace: string[] = [];
    const result = await agentRuntimeMastraErpSqlHandler.executePlan({
      runId: "1",
      sessionId: "2",
      ownerUserId: "tester",
      options: { message: "查询采购订单", confirmed: true },
      plan: await agentRuntimeMastraErpSqlHandler.createPlan({ message: "查询采购订单" }),
      async onToolStart({ step }) {
        toolTrace.push(`start:${step.tool}`);
      },
      async onToolFinish({ step }) {
        toolTrace.push(`finish:${step.tool}`);
      },
    });

    assert.equal(result.assistantMessage?.content, "已生成并执行 SQL，返回 1 行。");
    assert.equal((result.assistantMessage?.contentJsonb as any).rowCount, 1);
    assert.deepEqual(toolTrace, [
      "start:extractSqlIntent",
      "finish:extractSqlIntent",
      "start:planSqlQuery",
      "finish:planSqlQuery",
      "start:findSqlTemplate",
      "finish:findSqlTemplate",
      "start:findSqlReference",
      "finish:findSqlReference",
      "start:generateSql",
      "finish:generateSql",
      "start:validateSql",
      "finish:validateSql",
      "start:executeSql",
      "finish:executeSql",
      "start:narrateSqlResult",
      "finish:narrateSqlResult",
    ]);
  } finally {
    restore();
  }
});

function stubToolchain(options: {
  template?: boolean;
  invalidGuard?: boolean;
  narrate?: boolean;
  narratorThrows?: boolean;
  onGenerate?: () => void;
  onExecute?: () => void;
} = {}) {
  const originals = {
    extract: deepSeekIntentExtractor.extract,
    plan: sqlPlannerService.plan,
    findExecutableCandidates: sqlTemplateRepository.findExecutableCandidates,
    findReferenceCandidates: sqlTemplateRepository.findReferenceCandidates,
    templateExecute: sqlTemplateExecutionService.execute,
    generate: sqlGeneratorService.generate,
    validate: sqlGuardService.validate,
    execute: sqlExecutorService.execute,
    narrate: resultNarratorService.narrate,
  };

  (deepSeekIntentExtractor as any).extract = async () => makeIntent();
  (sqlPlannerService as any).plan = async () => makePlan();
  (sqlTemplateRepository as any).findExecutableCandidates = async () => options.template ? [makeTemplateCandidate()] : [];
  (sqlTemplateRepository as any).findReferenceCandidates = async () => [];
  (sqlTemplateExecutionService as any).execute = async () => ({
    executed: true,
    valid: true,
    sql: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
    fields: ["Company", "PartNum"],
    rows: [["jctimes", "A123"]],
    rowCount: 1,
    truncated: false,
    warnings: [],
  });
  (sqlGeneratorService as any).generate = async () => {
    options.onGenerate?.();
    return makeGeneration();
  };
  (sqlGuardService as any).validate = async () => options.invalidGuard ? {
    valid: false,
    errors: ["blocked"],
    warnings: [],
    normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
    referencedTables: ["Erp.POHeader"],
    referencedFields: ["Company"],
  } : makeGuardResult();
  (sqlExecutorService as any).execute = async (generation: unknown) => {
    options.onExecute?.();
    return makeExecution(generation);
  };
  (resultNarratorService as any).narrate = async () => {
    if (options.narratorThrows) throw new Error("narrator down");
    if (!options.narrate) return { summary: "", highlights: [], caveats: [] };
    return {
      summary: "查询到 1 行。",
      highlights: ["公司为 jctimes"],
      caveats: ["仅基于返回样本说明"],
    };
  };

  return () => {
    (deepSeekIntentExtractor as any).extract = originals.extract;
    (sqlPlannerService as any).plan = originals.plan;
    (sqlTemplateRepository as any).findExecutableCandidates = originals.findExecutableCandidates;
    (sqlTemplateRepository as any).findReferenceCandidates = originals.findReferenceCandidates;
    (sqlTemplateExecutionService as any).execute = originals.templateExecute;
    (sqlGeneratorService as any).generate = originals.generate;
    (sqlGuardService as any).validate = originals.validate;
    (sqlExecutorService as any).execute = originals.execute;
    (resultNarratorService as any).narrate = originals.narrate;
  };
}

function makeIntent() {
  return {
    originalQuestion: "查询采购订单",
    normalizedQuestion: "查询采购订单",
    module: "purchase",
    intentType: "detail",
    entities: { partNum: "A123" },
    confidence: 0.9,
    warnings: [],
  };
}

function makePlan() {
  return {
    question: "查询采购订单",
    intent: "list",
    scenario: "purchaseDetail",
    modules: [],
    schema: {
      result: { query: "查询采购订单", keywords: [], tables: [], fields: [], score: 0 },
      selectedTables: [],
      selectedFields: [],
    },
    knowledge: {
      modules: [],
      joins: [],
      dateRules: { globalSafetyRange: { from: "20000101", to: "future_one_year" }, moduleDateFields: [] },
      statusRules: [],
      qualityRules: { rules: [] },
      companyRules: { mustOutputCompany: true },
      promptRules: { defaultLimit: 100 },
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
    confidence: 0.8,
  } as any;
}

function makeGuardResult() {
  return {
    valid: true,
    errors: [],
    warnings: [],
    normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
    referencedTables: ["Erp.POHeader"],
    referencedFields: ["Company"],
  };
}

function makeGeneration() {
  return {
    valid: true,
    source: "llm",
    scenario: "llmFallback",
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    intent: "list",
    tables: ["Erp.POHeader"],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: [],
    guardResult: makeGuardResult(),
  };
}

function makeExecution(generation: unknown) {
  return {
    valid: true,
    executed: true,
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    fields: ["Company"],
    rows: [["jctimes"]],
    rowCount: 1,
    truncated: false,
    warnings: [],
    generation,
  };
}

function makeTemplateCandidate() {
  return {
    id: BigInt(9),
    name: "物料查询",
    intent: "detail",
    module: "inventory",
    questionPattern: null,
    normalizedQuestion: null,
    queryPlanJson: {},
    sqlTemplate: "SELECT Company, PartNum FROM Erp.Part WHERE PartNum = @partNum",
    requiredParams: { partNum: { type: "string" } },
    optionalParams: {},
    tables: ["Erp.Part"],
    fields: ["Company", "PartNum"],
    joins: [],
    sourceType: "test",
    sourceDatasetId: null,
    sourceReportName: null,
    sourceSqlHash: null,
    guardPassed: true,
    guardJson: {},
    approved: true,
    approvalStatus: "approved",
    approvedBy: null,
    approvedAt: null,
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    score: 0.9,
    matchedSignals: ["partNum"],
  };
}
