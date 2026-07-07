import assert from "node:assert/strict";
import test from "node:test";
import { executeProductConfigPlan } from "../../src/modules/productConfigAgent/agent/executor.js";
import { createProductConfigPlan } from "../../src/modules/productConfigAgent/agent/planner.js";

test("product config agent planner extracts entities and builds deterministic tool chain", async () => {
  const plan = await createProductConfigPlan("请给客户:测试客户 产品类型:过滤器 产品编号:PN-001 生成配置表");

  assert.equal(plan.intent, "generate_config");
  assert.equal(plan.entities.customerName, "测试客户");
  assert.equal(plan.entities.productType, "过滤器");
  assert.equal(plan.entities.productNumber, "PN-001");
  assert.ok(plan.steps.some((step) => step.tool === "generateConfigDraft"));
  assert.ok(plan.steps.some((step) => step.tool === "saveProductConfig"));
});

test("product config agent executor traces tools, validates draft, and saves through callback", async () => {
  const plan = await createProductConfigPlan("请给客户:测试客户 产品类型:过滤器 产品编号:PN-001 生成配置表");
  const trace: string[] = [];
  const context = await executeProductConfigPlan(
    {
      ...plan,
      steps: plan.steps.filter((step) =>
        ["generateConfigDraft", "validateConfig", "saveProductConfig"].includes(step.tool),
      ),
    },
    {
      context: {
        options: { message: "生成配置表", confirmed: true },
        async saveGeneratedConfig(input) {
          return {
            id: "1",
            runId: "2",
            sessionId: "3",
            title: input.title ?? null,
            status: input.status,
            config: input.config,
            validation: input.validation,
            shareToken: null,
            shareTokenExpiresAt: null,
            shareTokenRevokedAt: null,
            ownerUserId: "tester",
          };
        },
      },
      async onToolStart({ step }) {
        trace.push(`start:${step.id}`);
      },
      async onToolFinish({ step, error }) {
        trace.push(`${error ? "failed" : "done"}:${step.id}`);
      },
    },
  );

  assert.ok(context.draftConfig);
  assert.equal(context.validation?.canSave, true);
  assert.equal(context.savedConfig?.status, "confirmed");
  assert.equal(context.toolTrace?.length, 3);
  assert.equal(context.toolTrace?.[0].status, "success");
  assert.deepEqual(trace, [
    "start:generate_config_draft",
    "done:generate_config_draft",
    "start:validate_config",
    "done:validate_config",
    "start:save_product_config",
    "done:save_product_config",
  ]);
});

test("product config agent executor records degraded tool failures without saving unvalidated drafts", async () => {
  const plan = await createProductConfigPlan("请给客户:测试客户 产品类型:过滤器 生成配置表");
  const context = await executeProductConfigPlan(
    {
      ...plan,
      steps: [
        { id: "generate_config_draft", tool: "generateConfigDraft", args: { userMessage: "生成", entities: plan.entities } },
        { id: "save_product_config", tool: "saveProductConfig", args: { userMessage: "生成", entities: plan.entities } },
      ],
    },
    {
      context: {
        options: { message: "生成配置表", confirmed: true },
        async saveGeneratedConfig() {
          throw new Error("should not save");
        },
      },
    },
  );

  assert.ok(context.draftConfig);
  assert.equal(context.savedConfig, null);
  assert.equal(context.toolTrace?.[1].status, "failed");
  assert.match(String((context.toolResults.save_product_config as any).error), /validation is required/);
  assert.ok(context.warnings.some((warning) => warning.includes("saveProductConfig failed")));
});
