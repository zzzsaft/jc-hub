import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger.js";
import { prisma } from "../../lib/prisma.js";
import { sanitizeLogPayload } from "../../lib/log-sanitizer.js";
import { getWecomAuthClient } from "./clients.js";
import { verifyAndDecryptWecomCallback, xmlText } from "./callback-crypto.js";
import { listWecomDepartmentIds, syncWecomUserDepartmentIds } from "./department-service.js";

const RAW_BODY_PREVIEW_MAX = 16 * 1024;

export const webhookRawBodySnapshot = (body: unknown) => {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const rawBodyBytes = Buffer.from(rawBody);
  let rawBodyPreview = rawBodyBytes.subarray(0, RAW_BODY_PREVIEW_MAX).toString("utf8");
  while (Buffer.byteLength(rawBodyPreview) > RAW_BODY_PREVIEW_MAX) {
    rawBodyPreview = rawBodyPreview.slice(0, -1);
  }
  return {
    rawBodyPreview,
    rawBodyLength: rawBodyBytes.length,
    rawBodyTruncated: rawBodyBytes.length > RAW_BODY_PREVIEW_MAX
  };
};

export const wecomWebhookPayload = (messageXml: string) => ({
  toUserName: xmlText(messageXml, "ToUserName") || null,
  fromUserName: xmlText(messageXml, "FromUserName") || null,
  createTime: xmlText(messageXml, "CreateTime") || null,
  msgType: xmlText(messageXml, "MsgType") || null,
  event: xmlText(messageXml, "Event") || null,
  changeType: xmlText(messageXml, "ChangeType") || null,
  userId: xmlText(messageXml, "UserID") || null,
  departmentId: xmlText(messageXml, "Id") || null
});

export const createWecomWebhookEvent = async (
  clientId: string,
  input: { query: unknown; headers: unknown; rawBody: unknown }
) =>
  prisma.webhookEvent.create({
    data: {
      provider: "wecom",
      clientId,
      query: sanitizeLogPayload(input.query) ?? Prisma.JsonNull,
      headers: sanitizeLogPayload(input.headers) ?? Prisma.JsonNull,
      ...webhookRawBodySnapshot(input.rawBody)
    },
    select: { id: true }
  });

export const finishWecomWebhookEvent = async (
  id: string,
  status: "processed" | "failed" | "ignored",
  payload?: ReturnType<typeof wecomWebhookPayload>,
  error?: unknown
) => {
  await prisma.webhookEvent.update({
    where: { id },
    data: {
      status,
      eventType: payload?.event ?? undefined,
      changeType: payload?.changeType ?? undefined,
      payload: payload ? sanitizeLogPayload(payload) ?? Prisma.JsonNull : undefined,
      errorMessage: error ? (error instanceof Error ? error.message : String(error)) : undefined,
      processedAt: new Date()
    }
  });
};

export const verifyWecomContactCallbackUrl = (clientId: string, query: Record<string, unknown>) => {
  const client = getWecomAuthClient(clientId);
  return verifyAndDecryptWecomCallback({
    token: client.callbackToken,
    encodingAESKey: client.callbackEncodingAESKey,
    corpId: client.corpId,
    msgSignature: query.msg_signature,
    timestamp: query.timestamp,
    nonce: query.nonce,
    encrypted: query.echostr
  });
};

export const decryptWecomContactCallbackBody = (clientId: string, query: Record<string, unknown>, body: unknown) => {
  const client = getWecomAuthClient(clientId);
  const bodyXml = typeof body === "string" ? body : "";
  const encrypted = xmlText(bodyXml, "Encrypt");
  return verifyAndDecryptWecomCallback({
    token: client.callbackToken,
    encodingAESKey: client.callbackEncodingAESKey,
    corpId: client.corpId,
    msgSignature: query.msg_signature,
    timestamp: query.timestamp,
    nonce: query.nonce,
    encrypted
  });
};

export const handleWecomContactCallback = async (clientId: string, messageXml: string) => {
  if (xmlText(messageXml, "Event") !== "change_contact") return "ignored" as const;

  const changeType = xmlText(messageXml, "ChangeType");
  if (["create_user", "update_user", "delete_user"].includes(changeType)) {
    await syncWecomUserDepartmentIds(clientId);
    return "processed" as const;
  }

  if (["create_party", "update_party"].includes(changeType)) {
    await listWecomDepartmentIds(clientId);
    return "processed" as const;
  }

  if (changeType === "delete_party") {
    const departmentId = Number(xmlText(messageXml, "Id"));
    if (Number.isInteger(departmentId)) {
      await prisma.wecomDepartment.deleteMany({ where: { clientId, departmentId } });
    }
    return "processed" as const;
  }

  logger.info(`[wecom callback]: ignored change_contact ${changeType || "unknown"}`);
  return "ignored" as const;
};
