import "../../../config/env.js";
import { productConfigAgentService } from "../service.js";

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!files.length) throw new Error("Usage: parseProductionDetailExcels.ts <file.xlsx> [more files]");
const results = [];
for (const filePath of files) {
  results.push(await productConfigAgentService.registerDocument({ filePath, source: "script" }));
}
console.log(JSON.stringify(results, null, 2));
