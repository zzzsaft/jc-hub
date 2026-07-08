import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
dotenv.config({ path: path.join(rootDir, ".env") });

const devEnvPath = path.join(rootDir, ".env.dev");
if (process.env.NODE_ENV !== "production" && fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath, override: true });
}

process.env.TZ = process.env.TZ || "Asia/Shanghai";
process.env.PORT ||= "2030";
