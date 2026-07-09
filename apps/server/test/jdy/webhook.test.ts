import assert from "node:assert/strict";
import test from "node:test";
import {
  createJdyWebhookEvent,
  failJdyWebhookEvent,
  parseJdyWebhookPayload,
  processJdyWebhookEvent,
  verifyJdyWebhookToken,
} from "../../src/integration/jdy/webhook-service.js";

const payload = (overrides: Record<string, unknown> = {}) => ({
  op: "data_create",
  opTime: 1783526400000,
  data: {
    _id: "data-1",
    formName: "报价审批",
    "流程状态": 0,
    submitter: { name: "张三", status: 1 },
    submitTime: "2026-07-09T00:00:00.000Z",
    ...overrides,
  },
});

function fakeDb() {
  const calls = {
    creates: [] as unknown[],
    updates: [] as unknown[],
    raw: [] as unknown[][],
  };
  return {
    calls,
    db: {
      webhookEvent: {
        create: async (args: unknown) => {
          calls.creates.push(args);
          return { id: "webhook-1" };
        },
        update: async (args: unknown) => {
          calls.updates.push(args);
          return {};
        },
      },
      $executeRaw: async (...args: unknown[]) => {
        calls.raw.push(args);
        return 1;
      },
    } as any,
  };
}

test("JDY webhook token requires configured secret and matching token", () => {
  assert.equal(verifyJdyWebhookToken({ expectedSecret: "", queryToken: "x" }), false);
  assert.equal(verifyJdyWebhookToken({ expectedSecret: "secret", queryToken: "bad" }), false);
  assert.equal(verifyJdyWebhookToken({ expectedSecret: "secret", queryToken: "secret" }), true);
  assert.equal(verifyJdyWebhookToken({ expectedSecret: "secret", headerToken: "secret" }), true);
});

test("JDY data_create creates webhook event, flow instance, and event log", async () => {
  const { db, calls } = fakeDb();
  const event = await createJdyWebhookEvent({ query: {}, headers: {}, rawBody: payload() }, db);
  await processJdyWebhookEvent(event.id, payload(), db, null);

  assert.equal(calls.creates.length, 1);
  assert.equal(calls.raw.length, 2);
  assert.equal(calls.updates.length, 1);
  assert.equal((calls.updates[0] as any).data.status, "processed");
  assert.equal((calls.updates[0] as any).data.eventType, "data_create");
});

test("JDY data_update updates same instance and appends event", async () => {
  const { db, calls } = fakeDb();
  await processJdyWebhookEvent("webhook-1", {
    ...payload({ modifier: { name: "李四" }, "流程状态": 1 }),
    op: "data_update",
  }, db, null);

  assert.equal(calls.raw.length, 2);
  assert.equal((calls.updates[0] as any).data.status, "processed");
  const parsed = parseJdyWebhookPayload({
    ...payload({ modifier: { name: "李四" }, "流程状态": 1 }),
    op: "data_update",
  });
  assert.equal(parsed.flowStatusText, "completed");
  assert.equal(parsed.operatorName, "李四");
});

test("JDY data_remove keeps instance and records deleter event", async () => {
  const { db, calls } = fakeDb();
  const parsed = await processJdyWebhookEvent("webhook-1", {
    op: "data_remove",
    opTime: 1783526400000,
    data: {
      _id: "data-1",
      formName: "报价审批",
      deleter: { name: "王五" },
      deleteTime: "2026-07-09T01:00:00.000Z",
    },
  }, db, null);

  assert.equal(calls.raw.length, 2);
  assert.equal(parsed.operatorName, "王五");
  assert.equal(parsed.deletedAtJdy?.toISOString(), "2026-07-09T01:00:00.000Z");
});

test("JDY webhook missing data id marks webhook event failed", async () => {
  const { db, calls } = fakeDb();
  const body = { op: "data_create", opTime: 1783526400000, data: { formName: "报价审批" } };
  await assert.rejects(() => processJdyWebhookEvent("webhook-1", body, db, null), /Missing JDY data\._id/);
  await failJdyWebhookEvent("webhook-1", body, new Error("Missing JDY data._id"), db);

  assert.equal(calls.raw.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal((calls.updates[0] as any).data.status, "failed");
  assert.equal((calls.updates[0] as any).data.eventType, "data_create");
});

test("JDY webhook syncs workflow instance and approval logs when client is configured", async () => {
  const { db, calls } = fakeDb();
  const workflowClient = {
    getWorkflowInstance: async () => ({
      app_id: "app-1",
      form_id: "form-1",
      form_title: "报价审批",
      instance_id: "data-1",
      status: 1,
      result: 1,
      creator: { name: "张三" },
      create_time: "2026-07-09T00:00:00.000Z",
      update_time: "2026-07-09T01:00:00.000Z",
      tasks: [],
    }),
    listWorkflowLogs: async () => [{
      flow_id: 2,
      flow_name: "部门审批",
      create_action: "forward",
      create_time: "2026-07-09T00:10:00.000Z",
      finish_action: "forward",
      finish_time: "2026-07-09T00:20:00.000Z",
      operator: { name: "李四", username: "lisi" },
      comment: "同意",
    }],
  };

  await processJdyWebhookEvent("webhook-1", payload(), db, workflowClient);

  assert.equal(calls.raw.length, 4);
  assert.equal((calls.updates[0] as any).data.status, "processed");
});
