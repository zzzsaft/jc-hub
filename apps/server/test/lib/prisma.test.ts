import assert from "node:assert/strict";
import test from "node:test";

import { avoidCodexSandboxRemoteDatabase } from "../../src/lib/prisma.js";

test("Codex sandbox rewrites the remote database URL to a fast local failure", () => {
  const originalSandbox = process.env.CODEX_SANDBOX_NETWORK_DISABLED;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    process.env.CODEX_SANDBOX_NETWORK_DISABLED = "1";
    process.env.DATABASE_URL = "postgresql://user:pass@hz.jc-times.com:5433/agent?schema=agent";

    avoidCodexSandboxRemoteDatabase();

    assert.equal(process.env.DATABASE_URL, "postgresql://postgres:postgres@127.0.0.1:9/agent?schema=agent");
  } finally {
    if (originalSandbox === undefined) delete process.env.CODEX_SANDBOX_NETWORK_DISABLED;
    else process.env.CODEX_SANDBOX_NETWORK_DISABLED = originalSandbox;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
