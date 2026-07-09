import assert from "node:assert/strict";
import test from "node:test";
import { JdyClient } from "../../src/integration/jdy/client.js";
import { JdyWorkflowOperationError, runJdyWorkflowOperation } from "../../src/integration/jdy/workflow-operations.js";

function fakeDb() {
  const calls = {
    query: [] as unknown[][],
    raw: [] as unknown[][],
  };
  return {
    calls,
    db: {
      $queryRaw: async (...args: unknown[]) => {
        calls.query.push(args);
        return [{ id: "operation-1" }];
      },
      $executeRaw: async (...args: unknown[]) => {
        calls.raw.push(args);
        return 1;
      },
    } as any,
  };
}

function fakeClient(response: Record<string, unknown> = { status: "success" }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    response,
    calls,
    approveWorkflowTask: async (...args: unknown[]) => {
      calls.push({ method: "approveWorkflowTask", args });
      return response;
    },
    getWorkflowInstance: async (...args: unknown[]) => {
      calls.push({ method: "getWorkflowInstance", args });
      return { instance_id: "data-1", status: 1 };
    },
    listWorkflowLogs: async (...args: unknown[]) => {
      calls.push({ method: "listWorkflowLogs", args });
      return [];
    },
  };
}

test("JdyClient maps workflow operation paths and bodies", async () => {
  const client = new JdyClient({ apiKey: "key", baseUrl: "https://api.jiandaoyun.com/api/v5" });
  const calls: Array<{ url: string; body: unknown }> = [];
  (client as any).http = {
    post: async (url: string, body: unknown) => {
      calls.push({ url, body });
      return { data: JSON.stringify({ status: "success", tasks: [], cc_list: [] }) };
    },
  };

  await client.listWorkflowTasks({ username: "u1", taskId: "t0", limit: 10 });
  await client.approveWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1", comment: "ok" });
  await client.rollbackWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1", flowId: 2, backType: 1 });
  await client.transferWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1", transferUsername: "u2" });
  await client.addSignWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1", addSignType: 1, addSignUsernames: ["u2"] });
  await client.revokeWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1" });
  await client.rejectWorkflowTask({ username: "u1", instanceId: "i1", taskId: "t1", comment: "no" });
  await client.closeWorkflowInstance("i1");
  await client.activateWorkflowInstance({ instanceId: "i1", flowId: 3 });
  await client.listWorkflowCc({ username: "u1", readStatus: "unread", skip: 0, limit: 10 });

  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.jiandaoyun.com/api/v6/workflow/task/list",
    "https://api.jiandaoyun.com/api/v1/workflow/task/approve",
    "https://api.jiandaoyun.com/api/v2/workflow/task/rollback",
    "https://api.jiandaoyun.com/api/v1/workflow/task/transfer",
    "https://api.jiandaoyun.com/api/v2/workflow/task/add_sign",
    "https://api.jiandaoyun.com/api/v2/workflow/task/revoke",
    "https://api.jiandaoyun.com/api/v1/workflow/task/reject",
    "https://api.jiandaoyun.com/api/v1/workflow/instance/close",
    "https://api.jiandaoyun.com/api/v1/workflow/instance/activate",
    "https://api.jiandaoyun.com/api/v1/workflow/cc/list",
  ]);
  assert.deepEqual(calls[1]?.body, { username: "u1", instance_id: "i1", task_id: "t1", comment: "ok" });
  assert.deepEqual(calls[4]?.body, { username: "u1", instance_id: "i1", task_id: "t1", add_sign_type: 1, add_sign_usernames: ["u2"] });
});

test("JDY workflow operation logs success and refreshes snapshot", async () => {
  const { db, calls } = fakeDb();
  const client = fakeClient();

  const result = await runJdyWorkflowOperation({
    action: "approve",
    actorUserId: "user-1",
    jdyUsername: "u1",
    instanceId: "data-1",
    taskId: "task-1",
    request: { username: "u1" },
    refreshInstanceId: "data-1",
    call: (jdy) => (jdy as any).approveWorkflowTask({}),
  }, client as any, db);

  assert.equal(result.operationLogId, "operation-1");
  assert.equal(calls.query.length, 1);
  assert.equal(calls.raw.length, 1);
  assert.deepEqual(client.calls.map((call) => call.method), ["approveWorkflowTask", "getWorkflowInstance", "listWorkflowLogs"]);
});

test("JDY workflow operation logs JDY failure and returns normalized error", async () => {
  const { db, calls } = fakeDb();
  const client = fakeClient({ status: "failure", code: 1010, message: "用户不存在" });

  await assert.rejects(
    () => runJdyWorkflowOperation({
      action: "approve",
      request: { username: "bad" },
      call: (jdy) => (jdy as any).approveWorkflowTask({}),
    }, client as any, db),
    (error) => error instanceof JdyWorkflowOperationError && error.statusCode === 502 && error.message === "用户不存在"
  );

  assert.equal(calls.query.length, 1);
  assert.equal(calls.raw.length, 0);
});

test("JDY workflow operation logs thrown errors", async () => {
  const { db, calls } = fakeDb();
  const client = {
    approveWorkflowTask: async () => {
      throw new Error("network down");
    },
  };

  await assert.rejects(
    () => runJdyWorkflowOperation({
      action: "approve",
      request: { username: "u1" },
      call: (jdy) => (jdy as any).approveWorkflowTask({}),
    }, client as any, db),
    /network down/
  );

  assert.equal(calls.query.length, 1);
});
