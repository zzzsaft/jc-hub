import type { Request, Response } from "express";
import { prisma } from "../../../lib/prisma.js";
import { agentRuntimeService } from "../../../modules/agentRuntime/defaultRuntime.js";
import { getProductConfigAgentUserId } from "../auth.js";
import { optionalNumber, optionalString, requireString } from "../params.js";

function cryptoRandomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
}

function mapGeneratedConfig(config: any) {
  return {
    ...config,
    id: String(config.id),
    runId: String(config.runId),
    sessionId: String(config.sessionId),
  };
}

export const listAgentSessions = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.listSessions({
      ownerUserId: await getProductConfigAgentUserId(request),
      agentType: "productConfigAgent",
      page: optionalNumber(request.query.page),
      pageSize: optionalNumber(request.query.pageSize),
    }),
  );
};

export const runAgent = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.run({
      sessionId: optionalString(request.body?.sessionId) ?? undefined,
      agentType: "productConfigAgent",
      message: requireString(request.body?.message, "message"),
      confirmed: request.body?.confirmed === true,
      referenceConfigId: optionalString(request.body?.referenceConfigId) ?? undefined,
      llmModel: optionalString(request.body?.llmModel) ?? undefined,
      context:
        request.body?.context && typeof request.body.context === "object"
          ? request.body.context
          : undefined,
      ownerUserId: await getProductConfigAgentUserId(request),
    }),
  );
};

export const getAgentSession = async (request: Request, response: Response) => {
  response.json(
    await agentRuntimeService.getSessionDetail({
      sessionId: requireString(request.params.sessionId, "sessionId"),
      ownerUserId: await getProductConfigAgentUserId(request),
    }),
  );
};

export const createShareToken = async (request: Request, response: Response) => {
  const id = BigInt(requireString(request.params.id, "id"));
  const token = cryptoRandomToken();
  const config = await prisma.agentGeneratedConfig.update({
    where: { id },
    data: {
      shareToken: token,
      shareTokenRevokedAt: null,
      shareTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  response.json(mapGeneratedConfig(config));
};

export const revokeShareToken = async (request: Request, response: Response) => {
  const id = BigInt(requireString(request.params.id, "id"));
  const config = await prisma.agentGeneratedConfig.update({
    where: { id },
    data: { shareTokenRevokedAt: new Date() },
  });
  response.json(mapGeneratedConfig(config));
};

export const getGeneratedConfig = async (request: Request, response: Response) => {
  const config = await prisma.agentGeneratedConfig.findUnique({
    where: { id: BigInt(requireString(request.params.id, "id")) },
  });
  if (!config) {
    response.status(404).json({ error: "Config not found" });
    return;
  }
  response.json(mapGeneratedConfig(config));
};

export const getSharedGeneratedConfig = async (request: Request, response: Response) => {
  const config = await prisma.agentGeneratedConfig.findFirst({
    where: {
      shareToken: requireString(request.params.shareToken, "shareToken"),
      shareTokenRevokedAt: null,
      OR: [{ shareTokenExpiresAt: null }, { shareTokenExpiresAt: { gt: new Date() } }],
    },
  });
  if (!config) {
    response.status(404).json({ error: "Shared config not found or expired" });
    return;
  }
  response.json(mapGeneratedConfig(config));
};
