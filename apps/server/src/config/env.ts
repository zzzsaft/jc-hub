import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const processEnvKeys = new Set(Object.keys(process.env));

loadEnvFile(path.join(rootDir, ".env"), false, processEnvKeys);

const devEnvPath = path.join(rootDir, ".env.dev");
if (process.env.NODE_ENV !== "production" && fs.existsSync(devEnvPath)) {
  loadEnvFile(devEnvPath, true, processEnvKeys);
}

const erpAgentEnvPath = path.join(rootDir, ".env.erp-agent");
if (fs.existsSync(erpAgentEnvPath)) {
  loadEnvFile(erpAgentEnvPath, true, processEnvKeys);
}

process.env.TZ = process.env.TZ || "Asia/Shanghai";
process.env.PORT ||= "2030";

function loadEnvFile(filePath: string, overridePreviousFiles: boolean, protectedKeys: Set<string>): void {
  const parsed = dotenv.config({ path: filePath, override: false }).parsed ?? {};
  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) continue;
    if (overridePreviousFiles || process.env[key] === undefined) process.env[key] = value;
  }
}
