import assert from "node:assert/strict";
import test from "node:test";
import { JiandaoyunRateLimiter } from "../../src/integration/jiandaoyun/rate-limit.js";

test("JiandaoyunRateLimiter waits when endpoint limit is reached", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = new JiandaoyunRateLimiter({
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });

  for (let index = 0; index < 10; index += 1) {
    await limiter.wait("/api/v5/app/entry/data/batch_create");
  }
  await limiter.wait("/api/v5/app/entry/data/batch_create");

  assert.deepEqual(sleeps, [1000]);
});

test("JiandaoyunRateLimiter also applies the global api key limit", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = new JiandaoyunRateLimiter({
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });

  for (let index = 0; index < 50; index += 1) {
    await limiter.wait(`/unknown/${index}`);
  }
  await limiter.wait("/unknown/overflow");

  assert.deepEqual(sleeps, [1000]);
});
