import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../../config/logger.js";
import { extractAuthToken, resolveUser } from "../../middleware/auth.js";
import {
  createJdyWebhookEvent,
  failJdyWebhookEvent,
  JdyWebhookBadRequestError,
  processJdyWebhookEvent,
  verifyJdyWebhookToken,
} from "./webhook-service.js";
import {
  createDefaultJdyClient,
  JdyWorkflowOperationError,
  runJdyWorkflowOperation,
} from "./workflow-operations.js";

export const jdyRouter = Router();

const authenticateJdyWorkflow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractAuthToken(req.headers.authorization, req.cookies);
    if (!token) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    req.authToken = token;
    req.user = await resolveUser(token);
    next();
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "UNAUTHORIZED" });
  }
};

const requireJdyAdmin = (req: Request, res: Response) => {
  if (req.user?.roles.includes("admin")) return true;
  res.status(403).json({ error: "FORBIDDEN" });
  return false;
};

jdyRouter.post("/integration/jdy/webhook", async (req, res, next) => {
  if (!verifyJdyWebhookToken({
    queryToken: req.query.token,
    headerToken: req.header("x-jdy-webhook-token"),
  })) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  let webhookEventId: string | null = null;
  try {
    const event = await createJdyWebhookEvent({
      query: req.query,
      headers: req.headers,
      rawBody: req.body,
      clientId: String(req.query.clientId ?? req.header("x-jdy-client-id") ?? "").trim() || null,
    });
    webhookEventId = event.id;
    await processJdyWebhookEvent(webhookEventId, req.body);
    res.json({ ok: true });
  } catch (error) {
    if (webhookEventId) {
      await failJdyWebhookEvent(webhookEventId, req.body, error).catch((logError) => {
        logger.error(logError instanceof Error ? logError.stack || logError.message : String(logError));
      });
    }
    if (error instanceof JdyWebhookBadRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
});

jdyRouter.use("/integration/jdy/workflow", authenticateJdyWorkflow);

jdyRouter.get("/integration/jdy/workflow/tasks", async (req, res, next) => {
  try {
    const username = requiredText(req.query.username, "username");
    const client = createDefaultJdyClient();
    res.json(await client.listWorkflowTasks({
      username,
      limit: optionalNumber(req.query.limit),
      taskId: optionalText(req.query.taskId),
    }));
  } catch (error) {
    handleJdyRouteError(error, res, next);
  }
});

jdyRouter.get("/integration/jdy/workflow/cc", async (req, res, next) => {
  try {
    const username = requiredText(req.query.username, "username");
    const readStatus = optionalText(req.query.readStatus) || "all";
    if (!["all", "read", "unread"].includes(readStatus)) {
      res.status(400).json({ error: "readStatus must be all, read, or unread" });
      return;
    }
    const client = createDefaultJdyClient();
    res.json(await client.listWorkflowCc({
      username,
      skip: optionalNumber(req.query.skip),
      limit: optionalNumber(req.query.limit),
      readStatus: readStatus as "all" | "read" | "unread",
    }));
  } catch (error) {
    handleJdyRouteError(error, res, next);
  }
});

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/approve", (req, res, next) =>
  runTaskAction(req, res, next, "approve", ["username", "instanceId"], (client, body, taskId) =>
    client.approveWorkflowTask({ username: body.username, instanceId: body.instanceId, taskId, comment: body.comment })
  )
);

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/rollback", (req, res, next) =>
  runTaskAction(req, res, next, "rollback", ["username", "instanceId"], (client, body, taskId) =>
    client.rollbackWorkflowTask({
      username: body.username,
      instanceId: body.instanceId,
      taskId,
      comment: body.comment,
      flowId: optionalNumber(body.flowId),
      backType: optionalNumber(body.backType),
    })
  )
);

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/transfer", (req, res, next) =>
  runTaskAction(req, res, next, "transfer", ["username", "instanceId", "transferUsername"], (client, body, taskId) =>
    client.transferWorkflowTask({
      username: body.username,
      instanceId: body.instanceId,
      taskId,
      transferUsername: body.transferUsername,
      comment: body.comment,
    })
  )
);

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/add-sign", (req, res, next) =>
  runTaskAction(req, res, next, "add_sign", ["username", "instanceId"], (client, body, taskId) =>
    client.addSignWorkflowTask({
      username: body.username,
      instanceId: body.instanceId,
      taskId,
      addSignType: requiredNumber(body.addSignType, "addSignType"),
      addSignUsernames: requiredStringArray(body.addSignUsernames, "addSignUsernames"),
      comment: body.comment,
    })
  )
);

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/revoke", (req, res, next) =>
  runTaskAction(req, res, next, "revoke", ["username", "instanceId"], (client, body, taskId) =>
    client.revokeWorkflowTask({ username: body.username, instanceId: body.instanceId, taskId, comment: body.comment })
  )
);

jdyRouter.post("/integration/jdy/workflow/tasks/:taskId/reject", (req, res, next) =>
  runTaskAction(req, res, next, "reject", ["username", "instanceId"], (client, body, taskId) =>
    client.rejectWorkflowTask({ username: body.username, instanceId: body.instanceId, taskId, comment: body.comment })
  )
);

jdyRouter.post("/integration/jdy/workflow/instances/:instanceId/close", async (req, res, next) => {
  if (!requireJdyAdmin(req, res)) return;
  try {
    const instanceId = requiredText(req.params.instanceId, "instanceId");
    const client = createDefaultJdyClient();
    res.json(await runJdyWorkflowOperation({
      action: "close_instance",
      actorUserId: req.user?.id,
      instanceId,
      request: { instanceId },
      refreshInstanceId: instanceId,
      call: () => client.closeWorkflowInstance(instanceId),
    }, client));
  } catch (error) {
    handleJdyRouteError(error, res, next);
  }
});

jdyRouter.post("/integration/jdy/workflow/instances/:instanceId/activate", async (req, res, next) => {
  if (!requireJdyAdmin(req, res)) return;
  try {
    const instanceId = requiredText(req.params.instanceId, "instanceId");
    const flowId = requiredNumber(req.body?.flowId, "flowId");
    const client = createDefaultJdyClient();
    res.json(await runJdyWorkflowOperation({
      action: "activate_instance",
      actorUserId: req.user?.id,
      instanceId,
      request: { instanceId, flowId },
      refreshInstanceId: instanceId,
      call: () => client.activateWorkflowInstance({ instanceId, flowId }),
    }, client));
  } catch (error) {
    handleJdyRouteError(error, res, next);
  }
});

async function runTaskAction(
  req: Request,
  res: Response,
  next: NextFunction,
  action: string,
  requiredFields: string[],
  call: (client: ReturnType<typeof createDefaultJdyClient>, body: Record<string, any>, taskId: string) => Promise<Record<string, unknown>>
) {
  try {
    const taskId = requiredText(req.params.taskId, "taskId");
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, any> : {};
    for (const field of requiredFields) requiredText(body[field], field);
    const client = createDefaultJdyClient();
    res.json(await runJdyWorkflowOperation({
      action,
      actorUserId: req.user?.id,
      jdyUsername: body.username,
      instanceId: body.instanceId,
      taskId,
      request: { ...body, taskId },
      refreshInstanceId: body.instanceId,
      call: () => call(client, body, taskId),
    }, client));
  } catch (error) {
    handleJdyRouteError(error, res, next);
  }
}

function handleJdyRouteError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof JdyWorkflowOperationError) {
    res.status(error.statusCode).json({
      error: error.message,
      response: error.response,
    });
    return;
  }
  if (error instanceof Error && error.message.startsWith("Missing ")) {
    res.status(400).json({ error: error.message });
    return;
  }
  next(error);
}

function requiredText(value: unknown, field: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`Missing ${field}`);
  return text;
}

function optionalText(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredNumber(value: unknown, field: string) {
  const parsed = optionalNumber(value);
  if (typeof parsed !== "number") throw new Error(`Missing ${field}`);
  return parsed;
}

function requiredStringArray(value: unknown, field: string) {
  const values = Array.isArray(value) ? value.map(optionalText).filter(Boolean) : [];
  if (values.length === 0) throw new Error(`Missing ${field}`);
  return values;
}
