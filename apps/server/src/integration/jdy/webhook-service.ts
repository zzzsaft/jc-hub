import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { sanitizeLogPayload } from "../../lib/log-sanitizer.js";
import { webhookRawBodySnapshot } from "../wecom/callback-service.js";
import { JdyClient, type JdyWorkflowInstance, type JdyWorkflowLog } from "./client.js";

const VALID_OPS = new Set(["data_create", "data_update", "data_remove", "data_recover"]);

type JdyWebhookDb = Pick<typeof prisma, "$executeRaw" | "webhookEvent">;
type JdyWorkflowSnapshotDb = Pick<typeof prisma, "$executeRaw">;
type JdyWorkflowClient = Pick<JdyClient, "getWorkflowInstance" | "listWorkflowLogs">;

export class JdyWebhookBadRequestError extends Error {
  statusCode = 400;
}

export const verifyJdyWebhookToken = (input: { expectedSecret?: string; queryToken?: unknown; headerToken?: unknown }) => {
  const expectedSecret = String(input.expectedSecret ?? process.env.JDY_WEBHOOK_SECRET ?? "").trim();
  const token = textValue(input.headerToken) || textValue(input.queryToken);
  return Boolean(expectedSecret && token && token === expectedSecret);
};

export const createJdyWebhookEvent = async (
  input: { query: unknown; headers: unknown; rawBody: unknown; clientId?: string | null },
  db: JdyWebhookDb = prisma
) =>
  db.webhookEvent.create({
    data: {
      provider: "jdy",
      clientId: input.clientId ?? null,
      query: sanitizeLogPayload(input.query) ?? Prisma.JsonNull,
      headers: sanitizeLogPayload(input.headers) ?? Prisma.JsonNull,
      ...webhookRawBodySnapshot(input.rawBody),
    },
    select: { id: true },
  });

export const processJdyWebhookEvent = async (
  webhookEventId: string,
  body: unknown,
  db: JdyWebhookDb = prisma,
  workflowClient: JdyWorkflowClient | null = defaultJdyWorkflowClient()
) => {
  const parsed = parseJdyWebhookPayload(body);
  await upsertJdyFlowInstance(parsed, db);
  await insertJdyFlowInstanceEvent(webhookEventId, parsed, db);
  if (workflowClient) {
    const instance = await workflowClient.getWorkflowInstance(parsed.jdyDataId);
    await updateJdyFlowInstanceFromApi(parsed.jdyDataId, instance, db);
    const logs = await workflowClient.listWorkflowLogs(parsed.jdyDataId);
    for (const log of logs) {
      await upsertJdyWorkflowLogEvent(webhookEventId, parsed.jdyDataId, log, db);
    }
  }
  await finishJdyWebhookEvent(webhookEventId, "processed", parsed, undefined, db);
  return parsed;
};

export const syncJdyWorkflowSnapshot = async (
  eventAnchorId: string,
  instanceId: string,
  workflowClient: JdyWorkflowClient,
  db: JdyWorkflowSnapshotDb = prisma
) => {
  const instance = await workflowClient.getWorkflowInstance(instanceId);
  await updateJdyFlowInstanceFromApi(instanceId, instance, db);
  const logs = await workflowClient.listWorkflowLogs(instanceId);
  for (const log of logs) {
    await upsertJdyWorkflowLogEvent(eventAnchorId, instanceId, log, db);
  }
};

export const failJdyWebhookEvent = (
  webhookEventId: string,
  body: unknown,
  error: unknown,
  db: JdyWebhookDb = prisma
) => finishJdyWebhookEvent(webhookEventId, "failed", safeParseJdyWebhookPayload(body), error, db);

export function parseJdyWebhookPayload(body: unknown) {
  const payload = objectValue(body);
  const op = textValue(payload.op);
  if (!VALID_OPS.has(op)) throw new JdyWebhookBadRequestError("Invalid JDY webhook op");
  const data = objectValue(payload.data);
  const jdyDataId = textValue(readJdyField(data, "_id") ?? data.data_id ?? data.dataId);
  if (!jdyDataId) throw new JdyWebhookBadRequestError("Missing JDY data._id");
  const flowStatus = numberValue(firstPresent(data, ["flowStatus", "flow_status", "flowState", "flow_state", "流程状态"]));
  const submitter = firstPresent(data, ["submitter", "creator", "提交人"]);
  const modifier = firstPresent(data, ["modifier", "updater", "修改人"]);
  const deleter = firstPresent(data, ["deleter", "删除人"]);
  const opTime = dateFromValue(payload.opTime);

  return {
    op,
    opTime,
    jdyDataId,
    formName: textValue(firstPresent(data, ["formName", "form_name", "表单名称"])) || null,
    flowStatus,
    flowStatusText: flowStatusText(flowStatus),
    submitter: jsonOrNull(submitter),
    modifier: jsonOrNull(modifier),
    deleter: jsonOrNull(deleter),
    submittedAt: dateFromValue(firstPresent(data, ["submitTime", "createTime", "createdAt", "_ctime", "提交时间"])),
    updatedAtJdy: dateFromValue(firstPresent(data, ["updateTime", "updatedAt", "_utime", "修改时间"])),
    deletedAtJdy: dateFromValue(firstPresent(data, ["deleteTime", "deletedAt", "删除时间"])),
    operatorName: operatorNameForOp(op, { submitter, modifier, deleter }),
    rawJson: payload,
  };
}

function safeParseJdyWebhookPayload(body: unknown) {
  try {
    return parseJdyWebhookPayload(body);
  } catch {
    const payload = objectValue(body);
    return {
      op: textValue(payload.op) || null,
      opTime: dateFromValue(payload.opTime),
      rawJson: payload,
    };
  }
}

async function finishJdyWebhookEvent(
  id: string,
  status: "processed" | "failed",
  payload: ReturnType<typeof parseJdyWebhookPayload> | ReturnType<typeof safeParseJdyWebhookPayload>,
  error: unknown,
  db: JdyWebhookDb
) {
  await db.webhookEvent.update({
    where: { id },
    data: {
      status,
      eventType: payload.op ?? undefined,
      payload: sanitizeLogPayload(payload.rawJson) ?? Prisma.JsonNull,
      errorMessage: error ? (error instanceof Error ? error.message : String(error)) : undefined,
      processedAt: new Date(),
    },
  });
}

async function upsertJdyFlowInstance(parsed: ReturnType<typeof parseJdyWebhookPayload>, db: JdyWebhookDb) {
  await db.$executeRaw`
    INSERT INTO integration.jdy_flow_instances
      (jdy_data_id, form_name, flow_status, flow_status_text, submitter, modifier, deleter,
       submitted_at, updated_at_jdy, deleted_at_jdy, raw_json, last_op, last_op_time, created_at, updated_at)
    VALUES
      (${parsed.jdyDataId}, ${parsed.formName}, ${parsed.flowStatus}, ${parsed.flowStatusText},
       ${parsed.submitter}, ${parsed.modifier}, ${parsed.deleter},
       ${parsed.submittedAt}, ${parsed.updatedAtJdy}, ${parsed.deletedAtJdy}, ${parsed.rawJson as Prisma.InputJsonObject},
       ${parsed.op}, ${parsed.opTime}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (jdy_data_id) DO UPDATE SET
      form_name = COALESCE(EXCLUDED.form_name, integration.jdy_flow_instances.form_name),
      flow_status = EXCLUDED.flow_status,
      flow_status_text = EXCLUDED.flow_status_text,
      submitter = COALESCE(EXCLUDED.submitter, integration.jdy_flow_instances.submitter),
      modifier = COALESCE(EXCLUDED.modifier, integration.jdy_flow_instances.modifier),
      deleter = COALESCE(EXCLUDED.deleter, integration.jdy_flow_instances.deleter),
      submitted_at = COALESCE(EXCLUDED.submitted_at, integration.jdy_flow_instances.submitted_at),
      updated_at_jdy = COALESCE(EXCLUDED.updated_at_jdy, integration.jdy_flow_instances.updated_at_jdy),
      deleted_at_jdy = COALESCE(EXCLUDED.deleted_at_jdy, integration.jdy_flow_instances.deleted_at_jdy),
      raw_json = EXCLUDED.raw_json,
      last_op = EXCLUDED.last_op,
      last_op_time = EXCLUDED.last_op_time,
      updated_at = CURRENT_TIMESTAMP
  `;
}

async function updateJdyFlowInstanceFromApi(jdyDataId: string, instance: JdyWorkflowInstance, db: JdyWorkflowSnapshotDb) {
  const flowStatus = numberValue(instance.status);
  await db.$executeRaw`
    UPDATE integration.jdy_flow_instances SET
      app_id = ${textValue(instance.app_id) || null},
      form_id = ${textValue(instance.form_id) || null},
      form_name = COALESCE(${textValue(instance.form_title) || null}, form_name),
      instance_url = ${textValue(instance.url) || null},
      flow_status = ${flowStatus},
      flow_status_text = ${flowStatusText(flowStatus)},
      result = ${numberValue(instance.result)},
      submitter = COALESCE(${jsonOrNull(instance.creator)}, submitter),
      submitted_at = COALESCE(${dateFromValue(instance.create_time)}, submitted_at),
      updated_at_jdy = COALESCE(${dateFromValue(instance.update_time)}, updated_at_jdy),
      raw_instance_json = ${instance as Prisma.InputJsonObject},
      updated_at = CURRENT_TIMESTAMP
    WHERE jdy_data_id = ${jdyDataId}
  `;
}

async function insertJdyFlowInstanceEvent(
  webhookEventId: string,
  parsed: ReturnType<typeof parseJdyWebhookPayload>,
  db: JdyWebhookDb
) {
  await db.$executeRaw`
    INSERT INTO integration.jdy_flow_instance_events
      (jdy_data_id, webhook_event_id, event_source, event_key, op, op_time, operator_name, raw_json, created_at)
    VALUES
      (${parsed.jdyDataId}, ${webhookEventId}, 'webhook', ${`webhook:${webhookEventId}`}, ${parsed.op}, ${parsed.opTime},
       ${parsed.operatorName}, ${parsed.rawJson as Prisma.InputJsonObject}, CURRENT_TIMESTAMP)
  `;
}

async function upsertJdyWorkflowLogEvent(webhookEventId: string, jdyDataId: string, log: JdyWorkflowLog, db: JdyWorkflowSnapshotDb) {
  const eventKey = workflowLogEventKey(jdyDataId, log);
  await db.$executeRaw`
    INSERT INTO integration.jdy_flow_instance_events
      (jdy_data_id, webhook_event_id, event_source, event_key, op, op_time,
       flow_id, flow_name, create_action, finish_action, create_time, finish_time, comment,
       operator_name, operator, signature, attachments, raw_json, created_at)
    VALUES
      (${jdyDataId}, ${webhookEventId}, 'workflow_log', ${eventKey}, ${textValue(log.finish_action) || textValue(log.create_action) || "workflow_log"},
       ${dateFromValue(log.finish_time) ?? dateFromValue(log.create_time)},
       ${numberValue(log.flow_id)}, ${textValue(log.flow_name) || null}, ${textValue(log.create_action) || null}, ${textValue(log.finish_action) || null},
       ${dateFromValue(log.create_time)}, ${dateFromValue(log.finish_time)}, ${textValue(log.comment) || null},
       ${textValue(log.operator) || null}, ${jsonOrNull(log.operator)}, ${jsonOrNull(log.signature)}, ${jsonOrNull(log.attachments)},
       ${log as Prisma.InputJsonObject}, CURRENT_TIMESTAMP)
    ON CONFLICT (event_key) DO UPDATE SET
      webhook_event_id = EXCLUDED.webhook_event_id,
      op = EXCLUDED.op,
      op_time = EXCLUDED.op_time,
      flow_id = EXCLUDED.flow_id,
      flow_name = EXCLUDED.flow_name,
      create_action = EXCLUDED.create_action,
      finish_action = EXCLUDED.finish_action,
      create_time = EXCLUDED.create_time,
      finish_time = EXCLUDED.finish_time,
      comment = EXCLUDED.comment,
      operator_name = EXCLUDED.operator_name,
      operator = EXCLUDED.operator,
      signature = EXCLUDED.signature,
      attachments = EXCLUDED.attachments,
      raw_json = EXCLUDED.raw_json
  `;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readJdyField(row: Record<string, unknown>, field: string): unknown {
  const value = row[field];
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) return (value as { value?: unknown }).value;
  return value;
}

function firstPresent(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readJdyField(row, key);
    if (!isEmpty(value)) return value;
  }
  return undefined;
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(",");
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return textValue(object.name ?? object.username ?? object.nickname ?? object._id ?? object.id);
  }
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number | null {
  const parsed = Number(readJdyField(objectValue({ value }), "value"));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim().length >= 10 ? new Date(numeric) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return isEmpty(value) ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function flowStatusText(value: number | null) {
  if (value === 0) return "running";
  if (value === 1) return "completed";
  if (value === 2) return "manually_ended";
  return "unknown";
}

function operatorNameForOp(op: string, values: { submitter: unknown; modifier: unknown; deleter: unknown }) {
  if (op === "data_remove") return textValue(values.deleter) || null;
  if (op === "data_create" || op === "data_recover") return textValue(values.submitter) || null;
  return textValue(values.modifier) || textValue(values.submitter) || null;
}

function workflowLogEventKey(jdyDataId: string, log: JdyWorkflowLog) {
  const text = JSON.stringify({
    jdyDataId,
    flowId: log.flow_id,
    createTime: log.create_time,
    finishTime: log.finish_time,
    finishAction: log.finish_action,
    operator: textValue(log.operator),
    comment: log.comment,
  });
  return `workflow_log:${createHash("sha1").update(text).digest("hex")}`;
}

function defaultJdyWorkflowClient(): JdyWorkflowClient | null {
  const apiKey = process.env.JDY_API_KEY?.trim();
  if (!apiKey) return null;
  return new JdyClient({
    apiKey,
    baseUrl: process.env.JDY_API_BASE_URL,
  });
}
