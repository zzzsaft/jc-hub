import assert from "node:assert/strict";
import test from "node:test";
import { withTryAdvisoryTransactionLock } from "../../src/modules/productConfigAgent/utils/advisoryLock.js";

test("withTryAdvisoryTransactionLock runs action when lock is acquired", async () => {
  const calls: string[] = [];
  const tx = {
    $queryRawUnsafe: async (sql: string, key: number) => {
      calls.push(`${sql.includes("try") ? "lock" : "query"}:${key}`);
      return [{ locked: true }];
    },
  };
  const client = {
    $transaction: async (fn: any) => {
      calls.push("transaction");
      return fn(tx);
    },
  };

  const result = await withTryAdvisoryTransactionLock(client, 42, async (innerTx) => {
    assert.equal(innerTx, tx);
    calls.push("action");
    return "ok";
  });

  assert.deepEqual(result, { acquired: true, value: "ok" });
  assert.deepEqual(calls, ["transaction", "lock:42", "action"]);
});

test("withTryAdvisoryTransactionLock skips action on contention", async () => {
  let actionCalled = false;
  const client = {
    $transaction: async (fn: any) =>
      fn({
        $queryRawUnsafe: async () => [{ locked: false }],
      }),
  };

  const result = await withTryAdvisoryTransactionLock(client, 7, async () => {
    actionCalled = true;
  });

  assert.deepEqual(result, { acquired: false });
  assert.equal(actionCalled, false);
});

test("withTryAdvisoryTransactionLock propagates action failures through transaction", async () => {
  const client = {
    $transaction: async (fn: any) =>
      fn({
        $queryRawUnsafe: async () => [{ locked: true }],
      }),
  };

  await assert.rejects(
    withTryAdvisoryTransactionLock(client, 9, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
});
