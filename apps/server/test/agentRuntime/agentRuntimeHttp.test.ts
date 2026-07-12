import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { configureAgentRuntimeConcurrency, runAgentRuntimeLimited } from "../../src/ai/agentRuntime/service.js";
import { AgentRuntimeRoutes, handleAgentRuntimeError } from "../../src/ai/agentRuntime/routes.js";
import { livenessHandler, readinessHandler } from "../../src/index.js";

test("real Agent HTTP routes overload stably while health remains live and readiness degrades", async () => {
  const originalPort = process.env.PORT;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.PORT = "2030";
  process.env.NODE_ENV = "test";
  const routeApp = express();
  routeApp.use(express.json());
  routeApp.get("/health", livenessHandler);
  routeApp.get("/ready", readinessHandler);
  for (const route of AgentRuntimeRoutes) {
    (routeApp as any)[route.method](route.path, async (request: express.Request, response: express.Response, next: express.NextFunction) => {
      try { await route.action(request, response); } catch (error) { next(error); }
    });
  }
  routeApp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });
  const server = routeApp.listen(0);
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let release!: () => void;
  try {
    configureAgentRuntimeConcurrency(1, 0);
    const active = runAgentRuntimeLimited(() => new Promise<void>((resolve) => { release = resolve; }));

    const overloaded = await fetch(`${baseUrl}/agentRuntime/run`, request("sync"));
    const overloadedBody = await overloaded.json();
    assert.equal(overloaded.status, 429, JSON.stringify(overloadedBody));
    assert.deepEqual(overloadedBody, {
      error: "Agent runtime is busy",
      code: "AGENT_OVERLOADED",
      retryable: true,
    });

    const stream = await fetch(`${baseUrl}/agentRuntime/run/stream`, request("stream"));
    assert.equal(stream.status, 200);
    const streamBody = await stream.text();
    assert.match(streamBody, /event: error/);
    assert.match(streamBody, /"code":"AGENT_OVERLOADED"/);
    assert.match(streamBody, /"retryable":true/);

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok: boolean }).ok, true);
    release();
    await active;

    configureAgentRuntimeConcurrency(1, 1);
    const saturated = runAgentRuntimeLimited(() => new Promise<void>((resolve) => { release = resolve; }));
    const queued = runAgentRuntimeLimited(async () => undefined);
    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 503);
    assert.equal((await ready.json() as { ok: boolean }).ok, false);
    release();
    await Promise.all([saturated, queued]);
  } finally {
    release?.();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("unknown Agent HTTP errors escape the local mapper for the logged global 500 boundary", () => {
  assert.throws(() => handleAgentRuntimeError({} as never, new Error("infrastructure failed")), /infrastructure failed/);
});

function request(message: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "task-7-test" },
    body: JSON.stringify({ agentType: "mastraErpSqlAgent", message }),
  };
}
