import { AgentRuntimeRoutes } from "../ai/agentRuntime/routes.js";
import { UserPreferenceRoutes } from "../modules/userPreferences/routes/index.js";
import {
  LegacyProductConfigAgentRoutes,
  ProductConfigAgentRoutes,
} from "../modules/productConfigAgent/routes/productConfigAgent.routes.js";

export const AppRoutes = [
  ...AgentRuntimeRoutes,
  ...UserPreferenceRoutes,
  ...ProductConfigAgentRoutes,
  ...LegacyProductConfigAgentRoutes,
];
