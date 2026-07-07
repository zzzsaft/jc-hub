import { agentRuntimeProductConfigHandler } from "../../modules/productConfigAgent/agent/runtimeHandler.js";
import { agentRuntimeErpSqlHandler } from "../../modules/erpSqlAgent/agent/runtimeHandler.js";
import { agentRuntimeMastraErpSqlHandler } from "../../modules/erpSqlAgent/agent/mastraRuntimeHandler.js";
import { AgentRuntimeService } from "./service.js";

export const agentRuntimeService = new AgentRuntimeService()
  .registerAgent(agentRuntimeProductConfigHandler)
  .registerAgent(agentRuntimeErpSqlHandler)
  .registerAgent(agentRuntimeMastraErpSqlHandler);
