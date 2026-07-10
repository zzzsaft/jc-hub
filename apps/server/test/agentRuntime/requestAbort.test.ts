import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createAgentRuntimeRequestAbortScope } from "../../src/ai/agentRuntime/routes.js";

test("agent runtime request abort signal follows HTTP disconnect", () => {
  const request = Object.assign(new EventEmitter(), { complete: false });
  const response = Object.assign(new EventEmitter(), { writableEnded: false });
  const scope = createAgentRuntimeRequestAbortScope(request as never, response as never);

  request.emit("aborted");

  assert.equal(scope.signal.aborted, true);
  assert.equal(scope.signal.reason.code, "CLIENT_DISCONNECTED");
  assert.equal(scope.signal.reason.lifecycleStatus, "aborted");
  scope.cleanup();
});

test("agent runtime request signal enforces the server hard deadline", async () => {
  const original = process.env.ERP_SQL_AGENT_TOTAL_DEADLINE_MS;
  process.env.ERP_SQL_AGENT_TOTAL_DEADLINE_MS = "5";
  try {
    const request = Object.assign(new EventEmitter(), { complete: true });
    const response = Object.assign(new EventEmitter(), { writableEnded: false });
    const scope = createAgentRuntimeRequestAbortScope(request as never, response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(scope.signal.aborted, true);
    assert.equal(scope.signal.reason.code, "AGENT_RUNTIME_DEADLINE_EXCEEDED");
    assert.equal(scope.signal.reason.statusCode, 504);
    scope.cleanup();
  } finally {
    if (original === undefined) delete process.env.ERP_SQL_AGENT_TOTAL_DEADLINE_MS;
    else process.env.ERP_SQL_AGENT_TOTAL_DEADLINE_MS = original;
  }
});
