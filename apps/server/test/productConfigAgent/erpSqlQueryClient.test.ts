import assert from "node:assert/strict";
import test from "node:test";
import { AxiosHeaders, type AxiosInstance } from "axios";
import {
  ErpSqlQueryClient,
  decryptJsonWithSecret,
  encryptJsonWithSecret,
  signBodyWithTimestamp,
} from "../../src/modules/erpSqlAgent/query/index.js";

test("ERP SQL query client encrypts, signs, and decrypts backend responses", async () => {
  const apiKey = "query-api-key";
  const cryptoSecret = "query-crypto-secret";
  const timestamp = 1_788_888_888_000;
  let capturedBody = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedUrl = "";

  const httpClient = {
    async post(url: string, body: string, config: any) {
      capturedUrl = url;
      capturedBody = body;
      capturedHeaders = normalizeHeaders(config.headers);
      const parsed = JSON.parse(body);
      const decrypted = decryptJsonWithSecret<{ sql: string; params?: unknown[]; maxRows?: number }>(
        parsed.encrypted,
        cryptoSecret,
      );

      assert.equal(decrypted.sql, "select * from customers where id = @p1");
      assert.deepEqual(decrypted.params, [1001]);
      assert.equal(decrypted.maxRows, 10);

      return {
        status: 200,
        data: {
          encrypted: encryptJsonWithSecret(
            {
              fields: ["id", "name"],
              rows: [[1001, "测试客户"]],
              rowCount: 1,
              truncated: false,
            },
            cryptoSecret,
          ),
        },
      };
    },
  } as unknown as AxiosInstance;

  const client = new ErpSqlQueryClient({
    baseUrl: "http://example.test/",
    apiKey,
    cryptoSecret,
    httpClient,
    now: () => timestamp,
  });

  const result = await client.query({
    sql: "select * from customers where id = @p1",
    params: [1001],
    maxRows: 10,
  });

  assert.equal(capturedUrl, "http://example.test/erp/query");
  assert.equal(capturedHeaders["x-timestamp"], String(timestamp));
  assert.equal(capturedHeaders["x-signature"], signBodyWithTimestamp(capturedBody, String(timestamp), apiKey));
  assert.deepEqual(result, {
    fields: ["id", "name"],
    rows: [[1001, "测试客户"]],
    rowCount: 1,
    truncated: false,
  });
});

test("ERP SQL query client reports backend errors", async () => {
  const httpClient = {
    async post() {
      return { status: 401, data: { error: "Invalid request signature" } };
    },
  } as unknown as AxiosInstance;

  const client = new ErpSqlQueryClient({
    baseUrl: "http://example.test",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient,
  });

  await assert.rejects(
    () => client.query({ sql: "select 1" }),
    /Invalid request signature/,
  );
});

test("ERP SQL query client auto-selects LAN backend when reachable", async () => {
  let capturedUrl = "";
  const client = new ErpSqlQueryClient({
    baseUrl: "auto",
    lanBaseUrl: "http://lan.test:780",
    publicBaseUrl: "http://public.test:780",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient: makeQueryHttpClient((url) => {
      capturedUrl = url;
    }),
    probeBackend: async (baseUrl) => baseUrl === "http://lan.test:780",
  });

  await client.query({ sql: "select 1" });

  assert.equal(capturedUrl, "http://lan.test:780/erp/query");
});

test("ERP SQL query client auto-selects public backend when LAN is unreachable", async () => {
  let capturedUrl = "";
  const client = new ErpSqlQueryClient({
    baseUrl: "auto",
    lanBaseUrl: "http://lan.test:780",
    publicBaseUrl: "http://public.test:780",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient: makeQueryHttpClient((url) => {
      capturedUrl = url;
    }),
    probeBackend: async () => false,
  });

  await client.query({ sql: "select 1" });

  assert.equal(capturedUrl, "http://public.test:780/erp/query");
});

function makeQueryHttpClient(captureUrl: (url: string) => void): AxiosInstance {
  return {
    async post(url: string) {
      captureUrl(url);
      return {
        status: 200,
        data: {
          encrypted: encryptJsonWithSecret(
            {
              fields: [],
              rows: [],
              rowCount: 0,
              truncated: false,
            },
            "query-crypto-secret",
          ),
        },
      };
    },
  } as unknown as AxiosInstance;
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (headers instanceof AxiosHeaders) {
    return Object.fromEntries(
      Object.entries(headers.toJSON()).map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
  }
  return Object.fromEntries(
    Object.entries((headers ?? {}) as Record<string, unknown>).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
}
