import assert from "node:assert/strict";
import test from "node:test";
import { SqlExecutorService, type SqlExecutorQueryClient } from "../../src/modules/erpSqlAgent/executor/index.js";
import type { ErpSqlQueryOptions, ErpSqlQueryResult } from "../../src/modules/erpSqlAgent/query/index.js";
import type { SqlGenerationResult } from "../../src/modules/erpSqlAgent/generator/index.js";

class FakeQueryClient implements SqlExecutorQueryClient {
  readonly calls: ErpSqlQueryOptions[] = [];

  constructor(private readonly result: ErpSqlQueryResult = defaultQueryResult(), private readonly error?: Error) {}

  async query(options: ErpSqlQueryOptions): Promise<ErpSqlQueryResult> {
    this.calls.push(options);
    if (this.error) throw this.error;
    return this.result;
  }
}

test("valid generation executes SQL through query client", async () => {
  const client = new FakeQueryClient({
    fields: ["Company", "PONum"],
    rows: [["jctimes", 1001]],
    rowCount: 1,
    truncated: false,
  });
  const executor = new SqlExecutorService(client);

  const result = await executor.execute(makeGeneration());

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0]?.sql, "SELECT TOP 100 Company FROM Erp.POHeader");
  assert.equal(client.calls[0]?.maxRows, 100);
  assert.equal(result.valid, true);
  assert.equal(result.executed, true);
  assert.deepEqual(result.fields, ["Company", "PONum"]);
  assert.deepEqual(result.rows, [["jctimes", 1001]]);
  assert.equal(result.rowCount, 1);
  assert.equal(result.truncated, false);
});

test("custom maxRows is forwarded", async () => {
  const client = new FakeQueryClient();
  const executor = new SqlExecutorService(client);

  await executor.execute(makeGeneration(), { maxRows: 25 });

  assert.equal(client.calls[0]?.maxRows, 25);
});

test("invalid generation does not call backend", async () => {
  const client = new FakeQueryClient();
  const executor = new SqlExecutorService(client);

  const result = await executor.execute(makeGeneration(false));

  assert.equal(client.calls.length, 0);
  assert.equal(result.valid, false);
  assert.equal(result.executed, false);
  assert.match(result.error ?? "", /guard blocked/);
});

test("backend error returns non-executed invalid result", async () => {
  const client = new FakeQueryClient(defaultQueryResult(), new Error("backend unavailable"));
  const executor = new SqlExecutorService(client);

  const result = await executor.execute(makeGeneration());

  assert.equal(client.calls.length, 1);
  assert.equal(result.valid, false);
  assert.equal(result.executed, false);
  assert.equal(result.error, "backend unavailable");
  assert.deepEqual(result.fields, []);
});

function makeGeneration(valid = true): SqlGenerationResult {
  return {
    valid,
    sql: "SELECT TOP 100 Company FROM Erp.POHeader",
    intent: "list",
    tables: ["Erp.POHeader"],
    joins: [],
    filters: [],
    assumptions: [],
    warnings: ["generator warning"],
    guardResult: {
      valid,
      errors: valid ? [] : ["guard blocked"],
      warnings: [],
      normalizedSql: "SELECT TOP 100 Company FROM Erp.POHeader",
      referencedTables: ["Erp.POHeader"],
      referencedFields: ["Company"],
    },
  };
}

function defaultQueryResult(): ErpSqlQueryResult {
  return {
    fields: [],
    rows: [],
    rowCount: 0,
    truncated: false,
  };
}
