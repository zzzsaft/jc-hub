import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma.js";
import type { AgentRuntimeAgentHandler } from "../../../ai/agentRuntime/types.js";
import { executeProductConfigPlan } from "./executor.js";
import { createProductConfigPlan } from "./planner.js";
import type { ProductConfigAgentPlan } from "./types.js";

export const agentRuntimeProductConfigHandler: AgentRuntimeAgentHandler = {
  agentType: "productConfigAgent",
  async createPlan(options) {
    return createProductConfigPlan(options.message);
  },
  async executePlan(input) {
    const context = await executeProductConfigPlan(input.plan as ProductConfigAgentPlan, {
      context: {
        options: {
          message: input.options.message,
          confirmed: input.options.confirmed,
          referenceConfigId: input.options.referenceConfigId,
          llmModel: input.options.llmModel,
          ownerUserId: input.ownerUserId,
        },
        async saveGeneratedConfig(configInput) {
          const generated = await prisma.agentGeneratedConfig.create({
            data: {
              runId: BigInt(input.runId),
              sessionId: BigInt(input.sessionId),
              title: configInput.title ?? "产品配置草稿",
              status: configInput.status,
              configJsonb: toJson(configInput.config),
              validationJsonb: toJson(configInput.validation),
              ownerUserId: input.ownerUserId ?? null,
              shareToken: crypto.randomBytes(18).toString("base64url"),
              shareTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            },
          });
          return {
            id: String(generated.id),
            runId: String(generated.runId),
            sessionId: String(generated.sessionId),
            title: generated.title,
            status: generated.status as "draft" | "confirmed" | "archived",
            config: generated.configJsonb,
            validation: generated.validationJsonb,
            shareToken: generated.shareToken,
            shareTokenExpiresAt: generated.shareTokenExpiresAt,
            shareTokenRevokedAt: generated.shareTokenRevokedAt,
            ownerUserId: generated.ownerUserId,
            createdAt: generated.createdAt,
            updatedAt: generated.updatedAt,
          };
        },
      },
      onToolStart: input.onToolStart,
      onToolFinish: input.onToolFinish,
    });
    const result = {
      generatedConfigId: context.savedConfig?.id ?? null,
      config: context.draftConfig,
      validation: context.validation,
      savedConfig: context.savedConfig,
      warnings: context.warnings,
      toolResults: context.toolResults,
    };
    return {
      context: result,
      artifacts: { generatedConfig: context.savedConfig, draftConfig: context.draftConfig },
      assistantMessage: {
        content: context.savedConfig ? "已生成产品配置草稿。" : "已生成产品配置草稿，但尚未保存。",
        contentJsonb: result,
      },
      contextSummary: result,
    };
  },
  async listArtifactsForSession(params) {
    const configs = await prisma.agentGeneratedConfig.findMany({
      where: {
        sessionId: BigInt(params.sessionId),
        ownerUserId: params.ownerUserId || undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      generatedConfigs: configs.map((config) => ({
        ...config,
        id: String(config.id),
        runId: String(config.runId),
        sessionId: String(config.sessionId),
      })),
    };
  },
};

function toJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}
