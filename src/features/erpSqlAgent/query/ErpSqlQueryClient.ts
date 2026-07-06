import axios, { type AxiosInstance } from "axios";
import net from "node:net";
import { decryptJsonWithSecret, encryptJsonWithSecret, type EncryptedPayload } from "./crypto.js";
import { signBodyWithTimestamp } from "./requestSignature.js";

export type ErpSqlQueryValue = string | number | boolean | null;

export type ErpSqlQueryOptions = {
  sql: string;
  params?: ErpSqlQueryValue[];
  maxRows?: number;
};

export type ErpSqlQueryResult = {
  fields: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
};

export type ErpSqlQueryClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  cryptoSecret?: string;
  timeoutMs?: number;
  httpClient?: AxiosInstance;
  now?: () => number;
  lanBaseUrl?: string;
  publicBaseUrl?: string;
  probeBackend?: BackendProbe;
};

export type BackendProbe = (baseUrl: string, timeoutMs: number) => Promise<boolean>;

export class ErpSqlQueryError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "ErpSqlQueryError";
  }
}

const AUTO_BACKEND = "auto";
const DEFAULT_LAN_BASE_URL = "http://192.168.0.216:780";
const DEFAULT_PUBLIC_BASE_URL = "http://122.226.146.110:780";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PROBE_TIMEOUT_MS = 800;

export class ErpSqlQueryClient {
  private readonly baseUrl?: string;
  private readonly lanBaseUrl: string;
  private readonly publicBaseUrl: string;
  private readonly apiKey: string;
  private readonly cryptoSecret: string;
  private readonly httpClient: AxiosInstance;
  private readonly now: () => number;
  private readonly probeBackend: BackendProbe;
  private resolvedAutoBaseUrl?: Promise<string>;

  constructor(options: ErpSqlQueryClientOptions = {}) {
    const configuredBaseUrl = options.baseUrl ?? process.env.ERP_QUERY_BACKEND_URL;
    this.baseUrl = configuredBaseUrl && configuredBaseUrl.trim().toLowerCase() !== AUTO_BACKEND
      ? normalizeBaseUrl(configuredBaseUrl)
      : undefined;
    this.lanBaseUrl = normalizeBaseUrl(options.lanBaseUrl ?? process.env.ERP_QUERY_LAN_BACKEND_URL ?? DEFAULT_LAN_BASE_URL);
    this.publicBaseUrl = normalizeBaseUrl(options.publicBaseUrl ?? process.env.ERP_QUERY_PUBLIC_BACKEND_URL ?? DEFAULT_PUBLIC_BASE_URL);
    this.apiKey = requireConfig("ERP_QUERY_API_KEY", options.apiKey ?? process.env.ERP_QUERY_API_KEY);
    this.cryptoSecret = requireConfig(
      "ERP_QUERY_CRYPTO_SECRET",
      options.cryptoSecret ?? process.env.ERP_QUERY_CRYPTO_SECRET,
    );
    this.httpClient =
      options.httpClient ??
      axios.create({
        timeout: Number(process.env.ERP_QUERY_CLIENT_TIMEOUT_MS ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        validateStatus: () => true,
        proxy: false,
      });
    this.now = options.now ?? Date.now;
    this.probeBackend = options.probeBackend ?? probeTcp;
  }

  async query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult> {
    const baseUrl = await this.getBaseUrl();
    const requestBody = JSON.stringify({
      encrypted: encryptJsonWithSecret(
        {
          sql: options.sql,
          params: options.params,
          maxRows: options.maxRows,
        },
        this.cryptoSecret,
      ),
    });
    const timestamp = String(this.now());
    const signature = signBodyWithTimestamp(requestBody, timestamp, this.apiKey);
    const response = await this.httpClient.post(`${baseUrl}/erp/query`, requestBody, {
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      transformRequest: [(data) => data],
    });

    if (response.status < 200 || response.status >= 300) {
      const message = readErrorMessage(response.data) ?? `ERP SQL query failed with HTTP ${response.status}`;
      throw new ErpSqlQueryError(message, response.status, sanitizeResponseBody(response.data));
    }

    const encrypted = readEncryptedResponse(response.data);
    return decryptJsonWithSecret<ErpSqlQueryResult>(encrypted, this.cryptoSecret);
  }

  private async getBaseUrl(): Promise<string> {
    if (this.baseUrl) return this.baseUrl;
    this.resolvedAutoBaseUrl ??= this.probeBackend(this.lanBaseUrl, DEFAULT_PROBE_TIMEOUT_MS).then((ok) =>
      ok ? this.lanBaseUrl : this.publicBaseUrl,
    );
    return this.resolvedAutoBaseUrl;
  }
}

let defaultClient: ErpSqlQueryClient | undefined;

export function getErpSqlQueryClient(): ErpSqlQueryClient {
  defaultClient ??= new ErpSqlQueryClient();
  return defaultClient;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function probeTcp(baseUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(baseUrl);
    const socket = net.createConnection({
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function requireConfig(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readEncryptedResponse(data: unknown): EncryptedPayload {
  if (!data || typeof data !== "object" || !("encrypted" in data)) {
    throw new Error("ERP SQL response is missing encrypted payload");
  }
  return (data as { encrypted: EncryptedPayload }).encrypted;
}

function readErrorMessage(data: unknown): string | undefined {
  if (typeof data === "string" && cleanErrorText(data)) return cleanErrorText(data);
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && cleanErrorText(error)) return cleanErrorText(error);
  }
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && cleanErrorText(message)) return cleanErrorText(message);
  }
  return undefined;
}

function sanitizeResponseBody(data: unknown): unknown {
  if (typeof data === "string") return cleanErrorText(data) ?? "";
  if (Array.isArray(data)) return data.map(sanitizeResponseBody);
  if (data && typeof data === "object") {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, sanitizeResponseBody(value)]));
  }
  return data;
}

function cleanErrorText(value: string): string | undefined {
  const cleaned = value.replace(/\0/gu, "").trim();
  return cleaned || undefined;
}
