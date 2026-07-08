import assert from "node:assert/strict";
import test from "node:test";
import { JiandaoyunClient } from "../../src/integration/jiandaoyun/client.js";

type PostCall = {
  url: string;
  body: unknown;
  config?: unknown;
};

const makeClient = () => {
  const calls: PostCall[] = [];
  const ratePaths: string[] = [];
  const client = new JiandaoyunClient({
    host: "http://jdy.test/api/v5/",
    apiKey: "test-key",
    rateLimiter: { wait: async (path) => { ratePaths.push(path); } },
    httpClient: {
      post: async (url, body, config) => {
        calls.push({ url, body, config });
        return { data: { ok: true } };
      },
    },
  });
  return { client, calls, ratePaths };
};

test("JiandaoyunClient maps app, form and widget requests", async () => {
  const { client, calls, ratePaths } = makeClient();

  await client.listApps({ limit: 20, skip: 2 });
  await client.listEntries({ appId: "app1", limit: 50, skip: 10 });
  await client.listWidgets({ appId: "app1", entryId: "entry1" });

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://jdy.test/api/v5/app/list",
      "http://jdy.test/api/v5/app/entry/list",
      "http://jdy.test/api/v5/app/entry/widget/list",
    ],
  );
  assert.deepEqual(calls[0].body, { limit: 20, skip: 2 });
  assert.deepEqual(calls[1].body, { app_id: "app1", limit: 50, skip: 10 });
  assert.deepEqual(calls[2].body, { app_id: "app1", entry_id: "entry1" });
  assert.deepEqual(ratePaths, [
    "/api/v5/app/list",
    "/api/v5/app/entry/list",
    "/api/v5/app/entry/widget/list",
  ]);
});

test("JiandaoyunClient maps data mutation requests", async () => {
  const { client, calls } = makeClient();

  await client.listData({ appId: "app1", entryId: "entry1", fields: ["_widget_1"], limit: 30 });
  await client.batchCreateData({ appId: "app1", entryId: "entry1", dataList: [{ _widget_1: { value: "a" } }], transactionId: "tx1" });
  await client.updateData({ appId: "app1", entryId: "entry1", dataId: "data1", data: { _widget_1: { value: "b" } } });
  await client.batchUpdateData({ appId: "app1", entryId: "entry1", dataIds: ["data1"], data: { _widget_1: { value: "c" } } });
  await client.deleteData({ appId: "app1", entryId: "entry1", dataId: "data1" });
  await client.batchDeleteData({ appId: "app1", entryId: "entry1", dataIds: ["data1", "data2"] });

  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://jdy.test/api/v5/app/entry/data/list",
      "http://jdy.test/api/v5/app/entry/data/batch_create",
      "http://jdy.test/api/v5/app/entry/data/update",
      "http://jdy.test/api/v5/app/entry/data/batch_update",
      "http://jdy.test/api/v5/app/entry/data/delete",
      "http://jdy.test/api/v5/app/entry/data/batch_delete",
    ],
  );
  assert.deepEqual(calls[0].body, { app_id: "app1", entry_id: "entry1", fields: ["_widget_1"], limit: 30 });
  assert.deepEqual(calls[1].body, {
    app_id: "app1",
    entry_id: "entry1",
    data_list: [{ _widget_1: { value: "a" } }],
    transaction_id: "tx1",
  });
  assert.deepEqual(calls[2].body, { app_id: "app1", entry_id: "entry1", data_id: "data1", data: { _widget_1: { value: "b" } } });
  assert.deepEqual(calls[3].body, { app_id: "app1", entry_id: "entry1", data_ids: ["data1"], data: { _widget_1: { value: "c" } } });
  assert.deepEqual(calls[4].body, { app_id: "app1", entry_id: "entry1", data_id: "data1" });
  assert.deepEqual(calls[5].body, { app_id: "app1", entry_id: "entry1", data_ids: ["data1", "data2"] });
});

test("JiandaoyunClient maps workflow requests", async () => {
  const { client, calls, ratePaths } = makeClient();

  await client.getWorkflowApprovalComments({ appId: "app1", entryId: "entry1", dataId: "data1", skip: 5 });
  await client.getWorkflowInstance({ instanceId: "ins1", tasksType: 1 });
  await client.listWorkflowLogs({ instanceId: "ins1", types: ["approve"], limit: 10, skip: 1 });
  await client.closeWorkflowInstance({ instanceId: "ins1" });
  await client.activateWorkflowInstance({ instanceId: "ins1", flowId: 2 });
  await client.listWorkflowTasks({ username: "u1", limit: 10, taskId: "t0" });
  await client.approveWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1", comment: "ok" });
  await client.rollbackWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1", flowId: 3, backType: 1 });
  await client.transferWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1", transferUsername: "u2" });
  await client.addSignWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1", addSignType: 1, addSignUsernames: ["u2"] });
  await client.revokeWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1" });
  await client.rejectWorkflowTask({ username: "u1", instanceId: "ins1", taskId: "t1" });
  await client.listWorkflowCc({ username: "u1", readStatus: "unread", limit: 10 });

  assert.equal(calls[0].url, "http://jdy.test/api/v1/app/app1/entry/entry1/data/data1/approval_comments");
  assert.deepEqual(calls[0].body, { skip: 5 });
  assert.deepEqual(calls[1].body, { instance_id: "ins1", tasks_type: 1 });
  assert.deepEqual(calls[2].body, { instance_id: "ins1", types: ["approve"], limit: 10, skip: 1 });
  assert.deepEqual(calls[4].body, { instance_id: "ins1", flow_id: 2 });
  assert.deepEqual(calls[8].body, { username: "u1", instance_id: "ins1", task_id: "t1", transfer_username: "u2" });
  assert.deepEqual(calls[9].body, { username: "u1", instance_id: "ins1", task_id: "t1", add_sign_type: 1, add_sign_usernames: ["u2"] });
  assert.deepEqual(calls[12].body, { username: "u1", limit: 10, read_status: "unread" });
  assert.deepEqual(ratePaths, [
    "/api/v1/app/entry/data/approval_comments",
    "/api/v6/workflow/instance/get",
    "/api/v1/workflow/instance/logs",
    "/api/v1/workflow/instance/close",
    "/api/v1/workflow/instance/activate",
    "/api/v6/workflow/task/list",
    "/api/v1/workflow/task/approve",
    "/api/v2/workflow/task/rollback",
    "/api/v1/workflow/task/transfer",
    "/api/v2/workflow/task/add_sign",
    "/api/v2/workflow/task/revoke",
    "/api/v1/workflow/task/reject",
    "/api/v1/workflow/cc/list",
  ]);
});

test("JiandaoyunClient maps file token and upload requests", async () => {
  const { client, calls, ratePaths } = makeClient();

  await client.getFileUploadToken({ appId: "app1", entryId: "entry1", transactionId: "tx1" });
  await client.uploadFile({ url: "http://upload.test/file", token: "token1", filename: "a.txt", file: new Blob(["hello"]) });

  assert.deepEqual(calls[0].body, { app_id: "app1", entry_id: "entry1", transaction_id: "tx1" });
  assert.equal(calls[1].url, "http://upload.test/file");
  assert.ok(calls[1].body instanceof FormData);
  assert.deepEqual(ratePaths, ["/api/v5/app/entry/file/get_upload_token", "file_upload"]);
});

test("JiandaoyunClient requires api key", async () => {
  const client = new JiandaoyunClient({
    apiKey: "",
    httpClient: { post: async () => ({ data: {} }) },
    rateLimiter: { wait: async () => {} },
  });

  await assert.rejects(() => client.listApps(), /JDY_API_KEY/);
});
