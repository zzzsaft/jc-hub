import axios, { type AxiosInstance } from "axios";

export type JdyDataRow = Record<string, unknown>;
export type JdyWidget = Record<string, unknown>;

export type JdyClientOptions = {
  apiKey: string;
  baseUrl?: string;
  appId: string;
  entryId: string;
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
}
