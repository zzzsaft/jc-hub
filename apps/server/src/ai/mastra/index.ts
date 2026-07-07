import { Mastra } from "@mastra/core/mastra";
import { erpSqlAskTool } from "./tools/erpSqlAsk.tool.js";
import {
  executeSqlTemplateTool,
  executeSqlTool,
  extractSqlIntentTool,
  findSqlReferenceTool,
  findSqlTemplateTool,
  generateSqlTool,
  narrateSqlResultTool,
  planSqlQueryTool,
  validateSqlTool,
} from "./tools/erpSql/toolchain.tools.js";
import { erpSqlToolchainWorkflow } from "./workflows/erpSqlToolchain.workflow.js";

export const mastra = new Mastra({
  tools: {
    erpSqlAskTool,
    extractSqlIntentTool,
    planSqlQueryTool,
    findSqlTemplateTool,
    findSqlReferenceTool,
    executeSqlTemplateTool,
    generateSqlTool,
    validateSqlTool,
    executeSqlTool,
    narrateSqlResultTool,
  },
  workflows: { erpSqlToolchainWorkflow },
});

export { erpSqlAskTool, erpSqlToolchainWorkflow };
