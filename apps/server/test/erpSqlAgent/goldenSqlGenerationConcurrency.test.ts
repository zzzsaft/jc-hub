import assert from "node:assert/strict";
import test from "node:test";
import { configureLlmConcurrencyLimit, runLlmLimited } from "../../src/ai/llm/llmConcurrency.js";
import { createConcurrencyLimiter } from "../../src/lib/concurrencyLimiter.js";

test("createConcurrencyLimiter caps concurrent tasks", async () => {
  const limit = createConcurrencyLimiter(2);
  let active = 0;
  let maxActive = 0;

  await Promise.all(Array.from({ length: 8 }, () => limit(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  })));

  assert.equal(maxActive, 2);
});

test("LLM limiter uses configured concurrency", async () => {
  configureLlmConcurrencyLimit(3);
  let active = 0;
  let maxActive = 0;

  await Promise.all(Array.from({ length: 9 }, () => runLlmLimited(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  })));

  assert.equal(maxActive, 3);
});

test("queued limiter task aborts immediately and is removed from metrics", async () => {
  const limit = createConcurrencyLimiter(1, { name: "test", maxQueue: 2 });
  let release!: () => void;
  const active = limit(() => new Promise<void>((resolve) => { release = resolve; }));
  const controller = new AbortController();
  const queued = limit(async () => undefined, controller.signal);

  assert.equal(limit.active, 1);
  assert.equal(limit.queued, 1);
  controller.abort();
  await assert.rejects(queued, /aborted/iu);
  assert.equal(limit.queued, 0);
  assert.equal(limit.metrics().aborted, 1);

  release();
  await active;
});

test("bounded limiter rejects overload without growing the queue", async () => {
  const limit = createConcurrencyLimiter(1, { name: "bounded", maxQueue: 0 });
  let release!: () => void;
  const active = limit(() => new Promise<void>((resolve) => { release = resolve; }));

  await assert.rejects(limit(async () => undefined), /bounded queue is full/);
  assert.equal(limit.queued, 0);
  assert.equal(limit.metrics().overloaded, 1);
  release();
  await active;
});
