import "../../../config/env.js";
import { conceptResolverService } from "../dictionary/conceptResolver.service.js";

const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 200);
console.log(JSON.stringify(await conceptResolverService.runResolver({ limit, dryRun: true }), null, 2));
