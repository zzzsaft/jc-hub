import axios, { type AxiosInstance } from "axios";
import { AppError } from "../../lib/errors.js";
import { jiandaoyunRateLimiter } from "./rate-limit.js";

const DEFAULT_HOST = "https://api.jiandaoyun.com";

export type JiandaoyunClientOptions = {
  host?: string;
  apiKey?: string;
  timeoutMs?: number;
  httpClient?: Pick<AxiosInstance, "post">;
  rateLimiter?: Pick<typeof jiandaoyunRateLimiter, "wait">;
};

type WorkflowTaskParams = {
  username: string;
  instanceId: string;
  taskId: string;
  comment?: string;
};

export class JiandaoyunClient {
  private readonly host: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly httpClient: Pick<AxiosInstance, "post">;
  private readonly rateLimiter: Pick<typeof jiandaoyunRateLimiter, "wait">;

  constructor(options: JiandaoyunClientOptions = {}) {
    this.host = normalizeHost(options.host || process.env.JDY_HOST || DEFAULT_HOST);
    this.apiKey = options.apiKey ?? process.env.JDY_API_KEY ?? "";
    this.timeoutMs = options.timeoutMs ?? numberFromEnv("JDY_API_TIMEOUT_MS", 15000);
    this.httpClient = options.httpClient ?? axios;
    this.rateLimiter = options.rateLimiter ?? jiandaoyunRateLimiter;
  }

  listApps(params: { limit?: number; skip?: number } = {}) {
    return this.post("/api/v5/app/list", pageBody(params));
  }

  listEntries(params: { appId: string; limit?: number; skip?: number }) {
    return this.post("/api/v5/app/entry/list", {
      app_id: params.appId,
      ...pageBody(params),
    });
  }

  listWidgets(params: { appId: string; entryId: string }) {
    return this.post("/api/v5/app/entry/widget/list", {
      app_id: params.appId,
      entry_id: params.entryId,
    });
  }

  listData(params: { appId: string; entryId: string; dataId?: string; fields?: string[]; filter?: unknown; limit?: number }) {
    return this.post("/api/v5/app/entry/data/list", compactBody({
      app_id: params.appId,
      entry_id: params.entryId,
      data_id: params.dataId,
      fields: params.fields,
      filter: params.filter,
      limit: params.limit ?? 10,
    }));
  }

  batchCreateData(params: { appId: string; entryId: string; dataList: unknown[]; dataCreator?: string; transactionId?: string; isStartWorkflow?: boolean }) {
    return this.post("/api/v5/app/entry/data/batch_create", compactBody({
      app_id: params.appId,
      entry_id: params.entryId,
      data_list: params.dataList,
      data_creator: params.dataCreator,
      transaction_id: params.transactionId,
      is_start_workflow: params.isStartWorkflow,
    }));
  }

  updateData(params: { appId: string; entryId: string; dataId: string; data: Record<string, unknown>; isStartTrigger?: boolean; transactionId?: string }) {
    return this.post("/api/v5/app/entry/data/update", compactBody({
      app_id: params.appId,
      entry_id: params.entryId,
      data_id: params.dataId,
      data: params.data,
      is_start_trigger: params.isStartTrigger,
      transaction_id: params.transactionId,
    }));
  }

  batchUpdateData(params: { appId: string; entryId: string; dataIds: string[]; data: Record<string, unknown>; transactionId?: string }) {
    return this.post("/api/v5/app/entry/data/batch_update", compactBody({
      app_id: params.appId,
      entry_id: params.entryId,
      data_ids: params.dataIds,
      data: params.data,
      transaction_id: params.transactionId,
    }));
  }

  deleteData(params: { appId: string; entryId: string; dataId: string; isStartTrigger?: boolean }) {
    return this.post("/api/v5/app/entry/data/delete", compactBody({
      app_id: params.appId,
      entry_id: params.entryId,
      data_id: params.dataId,
      is_start_trigger: params.isStartTrigger,
    }));
  }

  batchDeleteData(params: { appId: string; entryId: string; dataIds: string[] }) {
    return this.post("/api/v5/app/entry/data/batch_delete", {
      app_id: params.appId,
      entry_id: params.entryId,
      data_ids: params.dataIds,
    });
  }

  getWorkflowApprovalComments(params: { appId: string; entryId: string; dataId: string; skip?: number }) {
    return this.post(
      `/api/v1/app/${params.appId}/entry/${params.entryId}/data/${params.dataId}/approval_comments`,
      compactBody({ skip: params.skip }),
      "/api/v1/app/entry/data/approval_comments",
    );
  }

  getWorkflowInstance(params: { instanceId: string; tasksType?: number }) {
    return this.post("/api/v6/workflow/instance/get", compactBody({ instance_id: params.instanceId, tasks_type: params.tasksType }));
  }

  listWorkflowLogs(params: { instanceId: string; types: string[]; limit?: number; skip?: number }) {
    return this.post("/api/v1/workflow/instance/logs", compactBody({
      instance_id: params.instanceId,
      types: params.types,
      limit: params.limit,
      skip: params.skip,
    }));
  }

  closeWorkflowInstance(params: { instanceId: string }) {
    return this.post("/api/v1/workflow/instance/close", { instance_id: params.instanceId });
  }

  activateWorkflowInstance(params: { instanceId: string; flowId: number }) {
    return this.post("/api/v1/workflow/instance/activate", { instance_id: params.instanceId, flow_id: params.flowId });
  }

  listWorkflowTasks(params: { username: string; limit?: number; taskId?: string }) {
    return this.post("/api/v6/workflow/task/list", compactBody({ username: params.username, limit: params.limit, task_id: params.taskId }));
  }

  approveWorkflowTask(params: WorkflowTaskParams) {
    return this.post("/api/v1/workflow/task/approve", workflowTaskBody(params));
  }

  rollbackWorkflowTask(params: WorkflowTaskParams & { flowId?: number; backType?: number }) {
    return this.post("/api/v2/workflow/task/rollback", compactBody({ ...workflowTaskBody(params), flow_id: params.flowId, back_type: params.backType }));
  }

  transferWorkflowTask(params: WorkflowTaskParams & { transferUsername: string }) {
    return this.post("/api/v1/workflow/task/transfer", { ...workflowTaskBody(params), transfer_username: params.transferUsername });
  }

  addSignWorkflowTask(params: WorkflowTaskParams & { addSignType: number; addSignUsernames: string[] }) {
    return this.post("/api/v2/workflow/task/add_sign", { ...workflowTaskBody(params), add_sign_type: params.addSignType, add_sign_usernames: params.addSignUsernames });
  }

  revokeWorkflowTask(params: { username: string; instanceId: string; taskId?: string; comment?: string }) {
    return this.post("/api/v2/workflow/task/revoke", compactBody({
      username: params.username,
      instance_id: params.instanceId,
      task_id: params.taskId,
      comment: params.comment,
    }));
  }

  rejectWorkflowTask(params: WorkflowTaskParams) {
    return this.post("/api/v1/workflow/task/reject", workflowTaskBody(params));
  }

  listWorkflowCc(params: { username: string; skip?: number; limit?: number; readStatus?: string }) {
    return this.post("/api/v1/workflow/cc/list", compactBody({
      username: params.username,
      skip: params.skip,
      limit: params.limit,
      read_status: params.readStatus,
    }));
  }

  getFileUploadToken(params: { appId: string; entryId: string; transactionId: string }) {
    return this.post("/api/v5/app/entry/file/get_upload_token", {
      app_id: params.appId,
      entry_id: params.entryId,
      transaction_id: params.transactionId,
    });
  }

  async uploadFile(params: { url: string; token: string; file: Blob; filename: string }) {
    await this.rateLimiter.wait("file_upload");
    const formData = new FormData();
    formData.append("token", params.token);
    formData.append("file", params.file, params.filename);
    const response = await this.httpClient.post(params.url, formData, { timeout: this.timeoutMs });
    return response.data;
  }

  private async post(path: string, body: Record<string, unknown>, rateLimitPath = path) {
    if (!this.apiKey) throw new AppError(500, "JDY_API_KEY 未配置");
    await this.rateLimiter.wait(rateLimitPath);
    const response = await this.httpClient.post(`${this.host}${path}`, body, {
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeHost = (value: string) => trimTrailingSlash(value).replace(/\/api(\/v\d+)?$/u, "");

const numberFromEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const pageBody = (params: { limit?: number; skip?: number }) => ({
  limit: params.limit ?? 100,
  skip: params.skip ?? 0,
});

const compactBody = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

const workflowTaskBody = (params: WorkflowTaskParams) => compactBody({
  username: params.username,
  instance_id: params.instanceId,
  task_id: params.taskId,
  comment: params.comment,
});

