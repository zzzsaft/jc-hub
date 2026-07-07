import { spawnSync } from "node:child_process";
import glob from "glob";

const files = glob.sync("apps/server/test/**/*.test.ts").sort();
if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
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
