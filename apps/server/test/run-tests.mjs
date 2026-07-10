import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import dotenv from "dotenv";

const collectTests = (dir) => readdirSync(dir)
  .flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? collectTests(path) : path.endsWith(".test.ts") ? [path] : [];
  });

const files = collectTests("apps/server/test").sort();
if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

dotenv.config({ path: resolve(".env") });
dotenv.config({ path: resolve(".env.erp-agent"), override: false });
if (process.env.NODE_ENV !== "production" && existsSync(resolve(".env.dev"))) {
  dotenv.config({ path: resolve(".env.dev"), override: false });
}

const result = spawnSync(process.execPath, ["--test", "--import", "tsx", ...files], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ERP_QUERY_API_KEY: process.env.ERP_QUERY_API_KEY ?? "test-api-key",
    ERP_QUERY_CRYPTO_SECRET: process.env.ERP_QUERY_CRYPTO_SECRET ?? "0123456789abcdef0123456789abcdef",
  },
});

process.exit(result.status ?? 1);
