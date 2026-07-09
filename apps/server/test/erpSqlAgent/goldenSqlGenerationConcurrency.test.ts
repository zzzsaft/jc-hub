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
