import assert from "node:assert/strict";
import test from "node:test";
import {
  configureAgentRuntimeConcurrency,
  getAgentRuntimeConcurrencyMetrics,
  runAgentRuntimeLimited,
} from "../../src/ai/agentRuntime/service.js";
import { configureLlmConcurrencyLimit, getLlmConcurrencyMetrics } from "../../src/ai/llm/llmConcurrency.js";
import { configureErpQueryConcurrency, getErpQueryConcurrencyMetrics } from "../../src/modules/erpSqlAgent/query/index.js";

test("five agent runs are capped at two with a bounded overload response", async () => {
  configureAgentRuntimeConcurrency(2, 1);
  let active = 0;
  let maxActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests = Array.from({ length: 5 }, () => runAgentRuntimeLimited(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gate;
    active -= 1;
  }));
  const settlement = Promise.allSettled(requests);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getAgentRuntimeConcurrencyMetrics().active, 2);
  assert.equal(getAgentRuntimeConcurrencyMetrics().queued, 1);
  release();
  const settled = await settlement;
  assert.equal(maxActive, 2);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 3);
  for (const item of settled.filter((value) => value.status === "rejected")) {
    const error = (item as PromiseRejectedResult).reason;
    assert.equal(error.statusCode, 429);
    assert.equal(error.code, "AGENT_OVERLOADED");
    assert.equal(error.retryable, true);
  }
});

test("Agent, LLM and ERP query pools have independent limits", () => {
  configureAgentRuntimeConcurrency(2, 3);
  configureLlmConcurrencyLimit(4, 5);
  configureErpQueryConcurrency(6, 7);
  assert.equal(getAgentRuntimeConcurrencyMetrics().limit, 2);
  assert.equal(getLlmConcurrencyMetrics().limit, 4);
  assert.equal(getErpQueryConcurrencyMetrics().limit, 6);
});

test("aborting a queued agent run frees its queue slot", async () => {
  configureAgentRuntimeConcurrency(1, 1);
  let release!: () => void;
  const active = runAgentRuntimeLimited(() => new Promise<void>((resolve) => { release = resolve; }));
  const controller = new AbortController();
  const queued = runAgentRuntimeLimited(async () => undefined, controller.signal);
  controller.abort();
  await assert.rejects(queued, /aborted/iu);
  assert.equal(getAgentRuntimeConcurrencyMetrics().queued, 0);
  const replacement = runAgentRuntimeLimited(async () => "entered");
  assert.equal(getAgentRuntimeConcurrencyMetrics().queued, 1);
  release();
  assert.equal(await replacement, "entered");
  await active;
});
