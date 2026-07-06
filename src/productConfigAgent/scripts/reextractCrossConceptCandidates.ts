import "../../../config/env.js";
import { productConfigAgentService } from "../service.js";

const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 20);
console.log(JSON.stringify(await productConfigAgentService.renormalizeBatch({ limit, scope: "cross_concept" }), null, 2));
