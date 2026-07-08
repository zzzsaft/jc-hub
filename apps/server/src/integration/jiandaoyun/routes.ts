import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/errors.js";
import { JiandaoyunClient } from "./client.js";

const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const formParamsSchema = z.object({
  appId: z.string().min(1),
  entryId: z.string().min(1),
});

const dataParamsSchema = formParamsSchema.extend({
  dataId: z.string().min(1),
});

const widgetDataSchema = z.record(z.string(), z.unknown());

const listDataSchema = z.object({
  dataId: z.string().optional(),
  fields: z.array(z.string()).optional(),
  filter: z.unknown().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const batchCreateDataSchema = z.object({
  dataList: z.array(widgetDataSchema).min(1).max(100),
  dataCreator: z.string().optional(),
  transactionId: z.string().optional(),
  isStartWorkflow: z.boolean().optional(),
});

const updateDataSchema = z.object({
  data: widgetDataSchema,
  isStartTrigger: z.boolean().optional(),
  transactionId: z.string().optional(),
});

const batchUpdateDataSchema = z.object({
  dataIds: z.array(z.string()).min(1).max(100),
  data: widgetDataSchema,
  transactionId: z.string().optional(),
});

const batchDeleteDataSchema = z.object({
  dataIds: z.array(z.string()).min(1).max(100),
});

const approvalCommentsSchema = z.object({
  skip: z.number().int().min(0).optional(),
});

const instanceIdSchema = z.object({
  instanceId: z.string().min(1),
});

const workflowInstanceSchema = instanceIdSchema.extend({
  tasksType: z.number().int().optional(),
});

const workflowLogsSchema = instanceIdSchema.extend({
  types: z.array(z.string()).min(1),
  limit: z.number().int().min(1).max(100).optional(),
  skip: z.number().int().min(0).optional(),
});

const activateWorkflowSchema = instanceIdSchema.extend({
  flowId: z.number().int(),
});

const workflowTaskListSchema = z.object({
  username: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  taskId: z.string().optional(),
});

const workflowTaskSchema = z.object({
  username: z.string().min(1),
  instanceId: z.string().min(1),
  taskId: z.string().min(1),
  comment: z.string().optional(),
});

const rollbackWorkflowTaskSchema = workflowTaskSchema.extend({
  flowId: z.number().int().optional(),
  backType: z.number().int().optional(),
});

const transferWorkflowTaskSchema = workflowTaskSchema.extend({
  transferUsername: z.string().min(1),
});

const addSignWorkflowTaskSchema = workflowTaskSchema.extend({
  addSignType: z.number().int(),
  addSignUsernames: z.array(z.string()).min(1),
});

const revokeWorkflowTaskSchema = z.object({
  username: z.string().min(1),
  instanceId: z.string().min(1),
  taskId: z.string().optional(),
  comment: z.string().optional(),
});

const workflowCcSchema = z.object({
  username: z.string().min(1),
  skip: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  readStatus: z.enum(["read", "unread", "all"]).optional(),
});

const uploadTokenSchema = z.object({
  transactionId: z.string().min(1),
});

const uploadFileSchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().optional(),
  fileBase64: z.string().min(1),
});

const client = new JiandaoyunClient();

export const jiandaoyunRouter = Router();

jiandaoyunRouter.get(
  "/integration/jiandaoyun/apps",
  asyncHandler(async (req, res) => {
    res.json(await client.listApps(pageQuerySchema.parse(req.query)));
  }),
);

jiandaoyunRouter.get(
  "/integration/jiandaoyun/apps/:appId/forms",
  asyncHandler(async (req, res) => {
    const params = z.object({ appId: z.string().min(1) }).parse(req.params);
    res.json(await client.listEntries({ ...params, ...pageQuerySchema.parse(req.query) }));
  }),
);

jiandaoyunRouter.get(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/widgets",
  asyncHandler(async (req, res) => {
    res.json(await client.listWidgets(formParamsSchema.parse(req.params)));
  }),
);

jiandaoyunRouter.post(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/list",
  asyncHandler(async (req, res) => {
    res.json(await client.listData({ ...formParamsSchema.parse(req.params), ...listDataSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.post(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch-create",
  asyncHandler(async (req, res) => {
    res.json(await client.batchCreateData({ ...formParamsSchema.parse(req.params), ...batchCreateDataSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.patch(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch",
  asyncHandler(async (req, res) => {
    res.json(await client.batchUpdateData({ ...formParamsSchema.parse(req.params), ...batchUpdateDataSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.delete(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/batch",
  asyncHandler(async (req, res) => {
    res.json(await client.batchDeleteData({ ...formParamsSchema.parse(req.params), ...batchDeleteDataSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.patch(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId",
  asyncHandler(async (req, res) => {
    res.json(await client.updateData({ ...dataParamsSchema.parse(req.params), ...updateDataSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.delete(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId",
  asyncHandler(async (req, res) => {
    res.json(await client.deleteData({ ...dataParamsSchema.parse(req.params), isStartTrigger: req.body?.isStartTrigger }));
  }),
);

jiandaoyunRouter.post(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/data/:dataId/workflow/approval-comments",
  asyncHandler(async (req, res) => {
    res.json(await client.getWorkflowApprovalComments({ ...dataParamsSchema.parse(req.params), ...approvalCommentsSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/instance/get", asyncHandler(async (req, res) => {
  res.json(await client.getWorkflowInstance(workflowInstanceSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/instance/logs", asyncHandler(async (req, res) => {
  res.json(await client.listWorkflowLogs(workflowLogsSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/instance/close", asyncHandler(async (req, res) => {
  res.json(await client.closeWorkflowInstance(instanceIdSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/instance/activate", asyncHandler(async (req, res) => {
  res.json(await client.activateWorkflowInstance(activateWorkflowSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/list", asyncHandler(async (req, res) => {
  res.json(await client.listWorkflowTasks(workflowTaskListSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/approve", asyncHandler(async (req, res) => {
  res.json(await client.approveWorkflowTask(workflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/rollback", asyncHandler(async (req, res) => {
  res.json(await client.rollbackWorkflowTask(rollbackWorkflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/transfer", asyncHandler(async (req, res) => {
  res.json(await client.transferWorkflowTask(transferWorkflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/add-sign", asyncHandler(async (req, res) => {
  res.json(await client.addSignWorkflowTask(addSignWorkflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/revoke", asyncHandler(async (req, res) => {
  res.json(await client.revokeWorkflowTask(revokeWorkflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/tasks/reject", asyncHandler(async (req, res) => {
  res.json(await client.rejectWorkflowTask(workflowTaskSchema.parse(req.body)));
}));

jiandaoyunRouter.post("/integration/jiandaoyun/workflow/cc/list", asyncHandler(async (req, res) => {
  res.json(await client.listWorkflowCc(workflowCcSchema.parse(req.body)));
}));

jiandaoyunRouter.post(
  "/integration/jiandaoyun/apps/:appId/forms/:entryId/files/upload-token",
  asyncHandler(async (req, res) => {
    res.json(await client.getFileUploadToken({ ...formParamsSchema.parse(req.params), ...uploadTokenSchema.parse(req.body) }));
  }),
);

jiandaoyunRouter.post("/integration/jiandaoyun/files/upload", asyncHandler(async (req, res) => {
  const body = uploadFileSchema.parse(req.body);
  const file = new Blob([Buffer.from(body.fileBase64, "base64")], { type: body.mime });
  res.json(await client.uploadFile({ url: body.url, token: body.token, filename: body.filename, file }));
}));
