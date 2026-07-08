import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: path.resolve(fileURLToPath(new URL("../../../.env", import.meta.url))),
});

process.env.TZ = process.env.TZ || "Asia/Shanghai";
process.env.PORT ||= process.env.NODE_ENV === "production" ? "2000" : "2001";
