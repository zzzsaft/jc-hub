import axios, { type AxiosInstance } from "axios";

export type JdyDataRow = Record<string, unknown>;
export type JdyWidget = Record<string, unknown>;
export type JdyWorkflowInstance = Record<string, unknown>;
export type JdyWorkflowLog = Record<string, unknown>;
export type JdyWorkflowResponse = Record<string, unknown>;

export type JdyClientOptions = {
  apiKey: string;
  baseUrl?: string;
  appId?: string;
  entryId?: string;
};

export class JdyClient {
  private readonly http: AxiosInstance;

  constructor(private readonly options: JdyClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl ?? "https://api.jiandaoyun.com/api/v5",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
      proxy: false,
      transformResponse: [(data) => data],
    });
  }

  async listAllData(params: { fields?: string[]; pageSize?: number } = {}): Promise<JdyDataRow[]> {
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 100));
    const rows: JdyDataRow[] = [];
    for (let skip = 0; ; skip += pageSize) {
      const page = await this.listData({ fields: params.fields, limit: pageSize, skip });
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  async listWidgets(): Promise<JdyWidget[]> {
    const response = await this.http.post("/app/entry/widget/list", {
      app_id: this.options.appId,
      entry_id: this.options.entryId,
    });
    const parsed = JSON.parse(String(response.data || "{}"));
    const data = Array.isArray(parsed.widgets)
      ? parsed.widgets
      : Array.isArray(parsed.data)
        ? parsed.data
        : Array.isArray(parsed.data?.widgets)
          ? parsed.data.widgets
          : [];
    return data.filter((row: unknown): row is JdyWidget => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }

  async getWorkflowInstance(instanceId: string): Promise<JdyWorkflowInstance> {
    const parsed = await this.postWorkflowApi("v6", "/workflow/instance/get", {
      instance_id: instanceId,
      tasks_type: 1,
    });
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JdyWorkflowInstance : {};
  }

  async listWorkflowLogs(instanceId: string): Promise<JdyWorkflowLog[]> {
    const limit = 100;
    const rows: JdyWorkflowLog[] = [];
    for (let skip = 0; ; skip += limit) {
      const parsed = await this.postWorkflowApi("v1", "/workflow/instance/logs", {
        instance_id: instanceId,
        types: ["comment"],
        skip,
        limit,
      });
      const logs = Array.isArray(parsed.logs) ? parsed.logs : [];
      rows.push(...logs.filter((row: unknown): row is JdyWorkflowLog => Boolean(row && typeof row === "object" && !Array.isArray(row))));
      if (logs.length < limit) return rows;
    }
  }

  async listWorkflowTasks(params: { username: string; limit?: number; taskId?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v6", "/workflow/task/list", {
      username: params.username,
      ...(params.limit ? { limit: params.limit } : {}),
      ...(params.taskId ? { task_id: params.taskId } : {}),
    });
  }

  async approveWorkflowTask(params: { username: string; instanceId: string; taskId: string; comment?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/task/approve", workflowTaskBody(params));
  }

  async rollbackWorkflowTask(params: { username: string; instanceId: string; taskId: string; comment?: string; flowId?: number; backType?: number }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v2", "/workflow/task/rollback", {
      ...workflowTaskBody(params),
      ...(typeof params.flowId === "number" ? { flow_id: params.flowId } : {}),
      ...(typeof params.backType === "number" ? { back_type: params.backType } : {}),
    });
  }

  async transferWorkflowTask(params: { username: string; instanceId: string; taskId: string; transferUsername: string; comment?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/task/transfer", {
      ...workflowTaskBody(params),
      transfer_username: params.transferUsername,
    });
  }

  async addSignWorkflowTask(params: { username: string; instanceId: string; taskId: string; addSignType: number; addSignUsernames: string[]; comment?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v2", "/workflow/task/add_sign", {
      ...workflowTaskBody(params),
      add_sign_type: params.addSignType,
      add_sign_usernames: params.addSignUsernames,
    });
  }

  async revokeWorkflowTask(params: { username: string; instanceId: string; taskId?: string; comment?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v2", "/workflow/task/revoke", workflowTaskBody(params));
  }

  async rejectWorkflowTask(params: { username: string; instanceId: string; taskId: string; comment?: string }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/task/reject", workflowTaskBody(params));
  }

  async closeWorkflowInstance(instanceId: string): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/instance/close", { instance_id: instanceId });
  }

  async activateWorkflowInstance(params: { instanceId: string; flowId: number }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/instance/activate", {
      instance_id: params.instanceId,
      flow_id: params.flowId,
    });
  }

  async listWorkflowCc(params: { username: string; skip?: number; limit?: number; readStatus?: "all" | "read" | "unread" }): Promise<JdyWorkflowResponse> {
    return this.postWorkflowApi("v1", "/workflow/cc/list", {
      username: params.username,
      ...(typeof params.skip === "number" ? { skip: params.skip } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
      read_status: params.readStatus ?? "all",
    });
  }

  private async listData(params: { fields?: string[]; limit: number; skip: number }): Promise<JdyDataRow[]> {
    const response = await this.http.post("/app/entry/data/list", {
      app_id: this.options.appId,
      entry_id: this.options.entryId,
      limit: params.limit,
      skip: params.skip,
      ...(params.fields?.length ? { fields: params.fields } : {}),
    });
    const parsed = JSON.parse(String(response.data || "{}"));
    const data = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.data?.data) ? parsed.data.data : [];
    return data.filter((row: unknown): row is JdyDataRow => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }

  async postWorkflowApi(version: "v1" | "v2" | "v6", path: string, body: Record<string, unknown>): Promise<JdyWorkflowResponse> {
    const baseUrl = (this.options.baseUrl ?? "https://api.jiandaoyun.com/api/v5").replace(/\/api\/v\d+\/?$/, `/api/${version}`);
    const response = await this.http.post(`${baseUrl}${path}`, body);
    return JSON.parse(String(response.data || "{}"));
  }
}

function workflowTaskBody(params: { username: string; instanceId: string; taskId?: string; comment?: string }) {
  return {
    username: params.username,
    instance_id: params.instanceId,
    ...(params.taskId ? { task_id: params.taskId } : {}),
    ...(params.comment !== undefined ? { comment: params.comment } : {}),
  };
}
