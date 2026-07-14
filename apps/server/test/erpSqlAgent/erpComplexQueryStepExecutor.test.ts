import assert from "node:assert/strict";
import test from "node:test";
import { executeDiagnosticComplexQueryStep } from "../../src/ai/mastra/workflows/erpComplexQueryStepExecutor.js";
import type { ErpSqlAccessScope } from "../../src/modules/erpSqlAgent/access/index.js";
import { sqlExecutorService } from "../../src/modules/erpSqlAgent/executor/index.js";
import { sqlGeneratorService } from "../../src/modules/erpSqlAgent/generator/index.js";
import { metricComposerService } from "../../src/modules/erpSqlAgent/planner/index.js";
import { SqlGuardService, sqlGuardService } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";
import { sqlTemplateRepository } from "../../src/modules/erpSqlAgent/templates/repository/SqlTemplateRepository.js";
import { sqlTemplateExecutionService } from "../../src/modules/erpSqlAgent/templates/service/SqlTemplateExecutionService.js";

const scope: ErpSqlAccessScope = {
  source: "server", actorUserId: "test", companies: ["EPIC03"],
  modules: ["sales", "inventory", "finance"], departments: "*", businessUnits: "*", customerNumbers: "*",
  sensitive: { finance: "full", customer: "full", employee: "full" }, auditReasons: [],
};

test("complex step accepts an executed template without composer or LLM", async () => {
  await withDiagnosticStubs({ template: true }, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.status, "completed");
    assert.equal(result.source, "template");
    assert.equal(result.sqlCount, 1);
    assert.deepEqual(calls, { template: 1, composer: 0, llm: 0, execute: 0, db: 0 });
  });
});

test("complex step falls back from template to composer before LLM", async () => {
  await withDiagnosticStubs({ composer: true }, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.status, "partial");
    assert.equal(result.source, "composer");
    assert.equal(result.sqlCount, 1);
    assert.deepEqual(calls, { template: 0, composer: 1, llm: 0, execute: 1, db: 1 });
  });
});

test("complex step reports generation and execution audit without exposing SQL in its public result", async () => {
  await withDiagnosticStubs({ composer: true }, async () => {
    const generations: unknown[] = [];
    const executions: Array<{ execution: unknown; elapsedMs: number }> = [];
    const result = await executeDiagnosticComplexQueryStep({
      ...input(),
      audit: {
        recordGeneration: async (value) => { generations.push(value); },
        recordExecution: async (execution, elapsedMs) => { executions.push({ execution, elapsedMs }); },
      },
    });

    assert.equal(generations.length, 1);
    assert.equal(executions.length, 1);
    assert(executions[0]!.elapsedMs >= 0);
    assert.equal("sql" in result, false);
    assert.equal("generation" in result, false);
    assert.equal("execution" in result, false);
  });
});

test("complex step skips a template from the wrong permission module", async () => {
  await withDiagnosticStubs({ template: true, templateModule: "finance", composer: true }, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.source, "composer");
    assert.deepEqual(calls, { template: 0, composer: 1, llm: 0, execute: 1, db: 1 });
  });
});

test("runtime-invalid composer SQL continues to guarded LLM fallback", async () => {
  await withDiagnosticStubs({
    composer: true,
    composerSql: "SELECT TOP 5 Company, MissingField AS product, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed GROUP BY Company, MissingField",
    guardError: (candidate) => candidate.includes("MissingField") ? "invalid composer field" : "",
  }, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.source, "llm");
    assert(result.warnings.includes("diagnostic_llm_sql_fallback"));
    assert.deepEqual(calls, { template: 0, composer: 1, llm: 1, execute: 1, db: 1 });
  });
});

test("complex step uses guarded LLM last and records the diagnostic warning", async () => {
  await withDiagnosticStubs({}, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.status, "partial");
    assert.equal(result.source, "llm");
    assert.equal(result.sqlCount, 1);
    assert(result.warnings.includes("diagnostic_llm_sql_fallback"));
    assert.deepEqual(calls, { template: 0, composer: 1, llm: 1, execute: 1, db: 1 });
  });
});

test("dependent LLM fallback receives the narrowed analysis plan and correlated tuples", async () => {
  let captured: any;
  const dependent = input();
  dependent.analysisPlan = {
    ...dependent.analysisPlan,
    timeRange: { kind: "current_year_first_half" },
    filters: [{ metric: "order_amount", op: "lt", value: 100 }],
    orderBy: [{ metric: "order_amount", direction: "DESC" }],
    joinKeyFilterTuples: [{ Company: "EPIC03", product: "A" }, { Company: "EPIC03", product: "B" }],
    diagnosticExplicitCoverage: { time: true, filters: ["order_amount:lt"], sorting: true, limit: true },
  } as any;
  await withDiagnosticStubs({ onGeneratePlan: (plan) => { captured = plan; } }, async () => {
    await executeDiagnosticComplexQueryStep(dependent);
  });
  assert.deepEqual(captured.diagnosticAnalysisPlan, dependent.analysisPlan);
});

test("complex step rejects out-of-scope Company SQL before the query client", async () => {
  await withDiagnosticStubs({ llmSql: "SELECT TOP 5 Company, PartNum AS product, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed WHERE Company = N'OTHER' AND PartNum = N'A' GROUP BY Company, PartNum" }, async (calls) => {
    const result = await executeDiagnosticComplexQueryStep(input());
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /outside authorized scope/);
    assert.equal(calls.execute, 1);
    assert.equal(calls.db, 0);
    assert.equal(result.rowCount, 0);
  });
});

test("complex step audits a rejected generation without inventing an execution audit", async () => {
  await withDiagnosticStubs({ llmSql: "SELECT TOP 5 Company, PartNum AS product FROM Erp.OrderHed WHERE Company = N'OTHER'" }, async () => {
    const generations: unknown[] = [];
    const executions: unknown[] = [];
    const result = await executeDiagnosticComplexQueryStep({
      ...input(),
      audit: {
        recordGeneration: async (value) => { generations.push(value); },
        recordExecution: async (value) => { executions.push(value); },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(generations.length, 1);
    assert.equal(executions.length, 0);
  });
});

test("invalid field, multi-statement, write SQL and missing Company execute zero DB calls", async () => {
  const cases = [
    ["SELECT TOP 5 Company, MissingField FROM Erp.OrderHed", "MissingField"],
    ["SELECT TOP 5 Company FROM Erp.OrderHed; SELECT TOP 5 Company FROM Erp.OrderDtl", "Multiple SQL"],
    ["DELETE FROM Erp.OrderHed WHERE Company = N'EPIC03'", "ACCESS_DENIED"],
    ["SELECT TOP 5 PartNum AS product FROM Erp.OrderHed", "output Company"],
  ] as const;
  for (const [candidate, reason] of cases) {
    await withDiagnosticStubs({ llmSql: candidate, realGuard: true }, async (calls) => {
      const result = await executeDiagnosticComplexQueryStep(input());
      assert.equal(result.status, "failed");
      assert.match(result.error ?? "", new RegExp(reason, "i"));
      assert.equal(calls.execute, 0);
      assert.equal(calls.db, 0);
    });
  }
});

function input() {
  return {
    question: "按产品查询销售额",
    step: {
      id: "sales_anchor", question: "按产品查询销售额", capabilityCode: "sales.order_amount", module: "sales" as const,
      metrics: ["order_amount"], dimensions: ["product"], joinKeys: ["Company", "product"], dependsOn: [],
      filters: [], orderBy: [], limit: 5,
    },
    analysisPlan: {
      route: "complex_composed" as const, mode: "decision_support" as const,
      grain: ["product"], metrics: ["order_amount"], requiredMetrics: ["order_amount"],
      filters: [], dimensions: ["product"], orderBy: [], limit: 5, dimensionFilters: { product: "A" },
    },
    queryPlan: queryPlan(), accessScope: scope, signal: new AbortController().signal,
  };
}

async function withDiagnosticStubs(
  options: {
    template?: boolean;
    templateModule?: string;
    composer?: boolean;
    composerSql?: string;
    llmSql?: string;
    guardError?: (sql: string) => string;
    realGuard?: boolean;
    onGeneratePlan?: (plan: any) => void;
  },
  run: (calls: { template: number; composer: number; llm: number; execute: number; db: number }) => Promise<void>,
) {
  const before = process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
  process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = "true";
  const calls = { template: 0, composer: 0, llm: 0, execute: 0, db: 0 };
  const originals = {
    findTemplates: sqlTemplateRepository.findExecutableCandidates,
    findMetrics: sqlTemplateRepository.findApprovedAtomicMetricCandidates,
    findDatasets: sqlTemplateRepository.findDatasetReferenceCandidates,
    findReferences: sqlTemplateRepository.findReferenceCandidates,
    templateExecute: sqlTemplateExecutionService.execute,
    compose: metricComposerService.compose,
    generate: sqlGeneratorService.generate,
    validate: sqlGuardService.validate,
    execute: sqlExecutorService.execute,
  };
  (sqlTemplateRepository as any).findExecutableCandidates = async () => options.template ? [templateCandidate(options.templateModule)] : [];
  (sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = async () => [];
  (sqlTemplateRepository as any).findDatasetReferenceCandidates = async () => [];
  (sqlTemplateRepository as any).findReferenceCandidates = async () => [];
  (sqlTemplateExecutionService as any).execute = async () => {
    calls.template += 1;
    return { valid: true, executed: true, sql: sql(), fields: ["Company", "product", "order_amount"], rows: [["EPIC03", "A", 10]], rowCount: 1, truncated: false, warnings: [] };
  };
  (metricComposerService as any).compose = async () => {
    calls.composer += 1;
    return options.composer
      ? { ok: true, generation: generation(options.composerSql ?? sql(), "rule"), references: [] }
      : { ok: false, error: "missing metric" };
  };
  (sqlGeneratorService as any).generate = async (plan: any) => {
    calls.llm += 1;
    options.onGeneratePlan?.(plan);
    return generation(options.llmSql ?? sql(), "llm");
  };
  const realGuard = new SqlGuardService({
    tableExists: async () => true,
    fieldExists: async (_schema: string, _table: string, field: string) => field.toLowerCase() !== "missingfield",
  });
  (sqlGuardService as any).validate = options.realGuard
    ? realGuard.validate.bind(realGuard)
    : async (candidate: string) => {
        const error = options.guardError?.(candidate) ?? "";
        return {
          valid: !error, errors: error ? [error] : [], warnings: [], normalizedSql: candidate,
          referencedTables: ["Erp.OrderHed"], referencedFields: ["Company", "PartNum", "DocOrderAmt"],
        };
      };
  (sqlExecutorService as any).execute = async (candidate: any, executionOptions: any) => {
    calls.execute += 1;
    const { SqlExecutorService } = await import("../../src/modules/erpSqlAgent/executor/service/SqlExecutorService.js");
    return new SqlExecutorService({
      query: async () => {
        calls.db += 1;
        return { fields: ["Company", "product", "order_amount"], rows: [["EPIC03", "A", 10]], rowCount: 1, truncated: false };
      },
    }, true, { validate: async (value: string) => ({ valid: true, errors: [], warnings: [], normalizedSql: value, referencedTables: [], referencedFields: [] }) })
      .execute(candidate, executionOptions);
  };
  try {
    await run(calls);
  } finally {
    (sqlTemplateRepository as any).findExecutableCandidates = originals.findTemplates;
    (sqlTemplateRepository as any).findApprovedAtomicMetricCandidates = originals.findMetrics;
    (sqlTemplateRepository as any).findDatasetReferenceCandidates = originals.findDatasets;
    (sqlTemplateRepository as any).findReferenceCandidates = originals.findReferences;
    (sqlTemplateExecutionService as any).execute = originals.templateExecute;
    (metricComposerService as any).compose = originals.compose;
    (sqlGeneratorService as any).generate = originals.generate;
    (sqlGuardService as any).validate = originals.validate;
    (sqlExecutorService as any).execute = originals.execute;
    if (before === undefined) delete process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES;
    else process.env.ERP_SQL_DIAGNOSTIC_BYPASS_ALL_BUSINESS_GATES = before;
  }
}

function sql() {
  return "SELECT TOP 5 Company, PartNum AS product, SUM(DocOrderAmt) AS order_amount FROM Erp.OrderHed WHERE PartNum = N'A' GROUP BY Company, PartNum";
}

function generation(candidate: string, source: "rule" | "llm") {
  return {
    valid: true, source, scenario: source === "llm" ? "llmFallback" : "atomicMetricComposer", sql: candidate,
    intent: "aggregate", tables: ["Erp.OrderHed"], joins: [], filters: [], assumptions: [], warnings: [],
    guardResult: { valid: true, errors: [], warnings: [], normalizedSql: candidate, referencedTables: ["Erp.OrderHed"], referencedFields: ["Company", "PartNum", "DocOrderAmt"] },
  } as any;
}

function templateCandidate(module = "sales") {
  return {
    id: BigInt(9), name: "product sales", intent: "summary", module, questionPattern: null, normalizedQuestion: null,
    queryPlanJson: { coveredFilterSlots: ["partNum"] }, sqlTemplate: sql(), requiredParams: { partNum: { type: "string" } }, optionalParams: {},
    tables: ["Erp.OrderHed"], fields: ["Company", "product", "order_amount"], joins: [], sourceType: "test",
    sourceDatasetId: null, sourceReportName: null, sourceSqlHash: null, guardPassed: true, guardJson: {}, approved: true,
    approvalStatus: "approved", approvedBy: null, approvedAt: null, usageCount: 0, successCount: 0, failureCount: 0,
    lastUsedAt: null, createdAt: new Date(), updatedAt: new Date(), score: 0.9, matchedSignals: ["partNum"], coveredFilterSlots: ["partNum"],
  };
}

function queryPlan() {
  return {
    question: "按产品查询销售额", intent: "aggregate", scenario: "diagnostic", modules: [{ module: "sales" }],
    schema: { result: {}, selectedTables: ["OrderHed"], selectedFields: ["Company", "PartNum", "DocOrderAmt"] },
    knowledge: { modules: [], joins: [], dateRules: {}, statusRules: [], qualityRules: {}, companyRules: { mustOutputCompany: true }, promptRules: { defaultLimit: 100 } },
    constraints: { schemaName: "Erp", requireCompany: true, defaultLimit: 100, requiresDateSafetyRange: false, recommendedStatusFilters: [] },
    warnings: [], missingRequiredFields: [], confidence: 1,
  } as any;
}
