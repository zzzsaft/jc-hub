import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntimeOverloadedError } from "../../src/ai/agentRuntime/service.js";
import { sendAgentRuntimeError } from "../../src/ai/agentRuntime/routes.js";
import { app } from "../../src/index.js";

test("agent overload is a stable retryable 429 and does not affect liveness", async () => {
  const response = mockResponse();
  sendAgentRuntimeError(response as never, new AgentRuntimeOverloadedError());
  assert.equal(response.statusCode, 429);
  assert.deepEqual(response.body, {
    error: "Agent runtime is busy",
    code: "AGENT_OVERLOADED",
    retryable: true,
  });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok: boolean }).ok, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function mockResponse() {
  return {
    headersSent: false,
    destroyed: false,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}
