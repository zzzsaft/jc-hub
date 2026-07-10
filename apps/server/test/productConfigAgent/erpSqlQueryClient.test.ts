import assert from "node:assert/strict";
import test from "node:test";
import { AxiosHeaders, type AxiosInstance } from "axios";
import {
  ErpSqlQueryClient,
  decryptJsonWithSecret,
  encryptJsonWithSecret,
  signBodyWithTimestamp,
  configureErpQueryConcurrency,
  getErpQueryConcurrencyMetrics,
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

test("ERP SQL query client re-probes auto backend after request failure", async () => {
  const capturedUrls: string[] = [];
  let probeCalls = 0;
  let postCalls = 0;
  const client = new ErpSqlQueryClient({
    baseUrl: "auto",
    lanBaseUrl: "http://lan.test:780",
    publicBaseUrl: "http://public.test:780",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient: {
      async post(url: string) {
        capturedUrls.push(url);
        postCalls += 1;
        if (postCalls === 1) throw new Error("network down");
        return encryptedEmptyResult();
      },
    } as unknown as AxiosInstance,
    probeBackend: async () => {
      probeCalls += 1;
      return probeCalls > 1;
    },
  });

  await assert.rejects(() => client.query({ sql: "select 1" }), /network down/);
  await client.query({ sql: "select 1" });

  assert.deepEqual(capturedUrls, [
    "http://public.test:780/erp/query",
    "http://lan.test:780/erp/query",
  ]);
});

test("ERP SQL query client aborts an in-flight HTTP request", async () => {
  configureErpQueryConcurrency(1, 1);
  const controller = new AbortController();
  const lifecycle: string[] = [];
  const client = new ErpSqlQueryClient({
    baseUrl: "http://example.test",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient: abortableHttpClient(),
  });

  const pending = client.query({ sql: "select 1", signal: controller.signal, onLifecycle: (status) => lifecycle.push(status) });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  await assert.rejects(pending, /aborted|canceled/iu);
  assert.deepEqual(lifecycle.slice(0, 3), ["not_sent", "queued", "request_sent"]);
  assert.equal(lifecycle.at(-1), "aborted");
  assert.equal(getErpQueryConcurrencyMetrics().active, 0);
});

test("ERP SQL query client reports its hard timeout as erp_query_slow", async () => {
  configureErpQueryConcurrency(1, 1);
  const originalTimeout = process.env.ERP_QUERY_CLIENT_TIMEOUT_MS;
  process.env.ERP_QUERY_CLIENT_TIMEOUT_MS = "5";
  const lifecycle: string[] = [];
  try {
    const client = new ErpSqlQueryClient({
      baseUrl: "http://example.test",
      apiKey: "query-api-key",
      cryptoSecret: "query-crypto-secret",
      httpClient: abortableHttpClient(),
    });

    await assert.rejects(
      client.query({ sql: "select 1", onLifecycle: (status) => lifecycle.push(status) }),
      (error: unknown) => (error as any)?.code === "ERP_QUERY_TIMEOUT" && (error as any)?.lifecycleStatus === "erp_query_slow",
    );
    assert.equal(lifecycle.at(-1), "erp_query_slow");
  } finally {
    if (originalTimeout === undefined) delete process.env.ERP_QUERY_CLIENT_TIMEOUT_MS;
    else process.env.ERP_QUERY_CLIENT_TIMEOUT_MS = originalTimeout;
  }
});

test("ERP SQL query pool returns stable 429 when its bounded queue is full", async () => {
  configureErpQueryConcurrency(1, 0);
  let release!: () => void;
  const client = new ErpSqlQueryClient({
    baseUrl: "http://example.test",
    apiKey: "query-api-key",
    cryptoSecret: "query-crypto-secret",
    httpClient: {
      post: () => new Promise((resolve) => { release = () => resolve(encryptedEmptyResult()); }),
    } as unknown as AxiosInstance,
  });

  const active = client.query({ sql: "select 1" });
  await assert.rejects(
    client.query({ sql: "select 2" }),
    (error: unknown) => error instanceof Error && error.message === "ERP_QUERY_OVERLOADED" && (error as any).statusCode === 429,
  );
  release();
  await active;
});

function makeQueryHttpClient(captureUrl: (url: string) => void): AxiosInstance {
  return {
    async post(url: string) {
      captureUrl(url);
      return encryptedEmptyResult();
    },
  } as unknown as AxiosInstance;
}

function abortableHttpClient(): AxiosInstance {
  return {
    post(_url: string, _body: string, config: { signal?: AbortSignal }) {
      return new Promise((_resolve, reject) => {
        const rejectAbort = () => reject(new Error("canceled"));
        if (config.signal?.aborted) rejectAbort();
        else config.signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    },
  } as unknown as AxiosInstance;
}

function encryptedEmptyResult() {
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
