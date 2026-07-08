type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export const JIANDAOYUN_GLOBAL_RATE_LIMIT_PER_SECOND = 50;

const RATE_LIMITS_BY_PATH: Record<string, number> = {
  "/api/v5/app/list": 30,
  "/api/v5/app/entry/list": 30,
  "/api/v5/app/entry/widget/list": 30,
  "/api/v5/app/entry/data/list": 30,
  "/api/v5/app/entry/data/batch_create": 10,
  "/api/v5/app/entry/data/update": 20,
  "/api/v5/app/entry/data/batch_update": 10,
  "/api/v5/app/entry/data/delete": 20,
  "/api/v5/app/entry/data/batch_delete": 10,
  "/api/v5/app/entry/file/get_upload_token": 20,
  "file_upload": 20,
  "/api/v1/app/entry/data/approval_comments": 30,
  "/api/v6/workflow/instance/get": 30,
  "/api/v1/workflow/instance/logs": 30,
  "/api/v1/workflow/instance/close": 20,
  "/api/v1/workflow/instance/activate": 20,
  "/api/v6/workflow/task/list": 20,
  "/api/v1/workflow/task/approve": 20,
  "/api/v2/workflow/task/rollback": 20,
  "/api/v1/workflow/task/transfer": 20,
  "/api/v2/workflow/task/add_sign": 20,
  "/api/v2/workflow/task/revoke": 20,
  "/api/v1/workflow/task/reject": 20,
  "/api/v1/workflow/cc/list": 5,
};

export class JiandaoyunRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clock: Clock = realClock) {}

  async wait(path: string) {
    while (true) {
      const now = this.clock.now();
      const waitMs = Math.max(
        this.waitFor("global", JIANDAOYUN_GLOBAL_RATE_LIMIT_PER_SECOND, now),
        this.waitFor(path, RATE_LIMITS_BY_PATH[path] ?? JIANDAOYUN_GLOBAL_RATE_LIMIT_PER_SECOND, now),
      );
      if (waitMs <= 0) {
        this.record("global", now);
        this.record(path, now);
        return;
      }
      await this.clock.sleep(waitMs);
    }
  }

  private waitFor(key: string, limit: number, now: number) {
    const bucket = this.prune(key, now);
    return bucket.length < limit ? 0 : bucket[0] + 1000 - now;
  }

  private record(key: string, now: number) {
    this.prune(key, now).push(now);
  }

  private prune(key: string, now: number) {
    const bucket = this.hits.get(key) ?? [];
    while (bucket.length > 0 && bucket[0] <= now - 1000) bucket.shift();
    this.hits.set(key, bucket);
    return bucket;
  }
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const jiandaoyunRateLimiter = new JiandaoyunRateLimiter();
