import { agentRuntimeProductConfigHandler } from "../../productConfigAgent/agent/runtimeHandler.js";
import { agentRuntimeErpSqlHandler } from "../erpSqlAgent/agent/runtimeHandler.js";
import { AgentRuntimeService } from "./service.js";

export const agentRuntimeService = new AgentRuntimeService()
  .registerAgent(agentRuntimeProductConfigHandler)
  .registerAgent(agentRuntimeErpSqlHandler);
