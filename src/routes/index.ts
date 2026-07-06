import { AgentRuntimeRoutes } from "../modules/agentRuntime/routes.js";
import { FrontendRoutes } from "../frontend/routes/index.js";
import {
  LegacyProductConfigAgentRoutes,
  ProductConfigAgentRoutes,
} from "../productConfigAgent/routes/productConfigAgent.routes.js";

export const AppRoutes = [
  ...AgentRuntimeRoutes,
  ...FrontendRoutes,
  ...ProductConfigAgentRoutes,
  ...LegacyProductConfigAgentRoutes,
];
