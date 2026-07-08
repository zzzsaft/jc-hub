import { AgentRuntimeRoutes } from "../ai/agentRuntime/routes.js";
import { UserPreferenceRoutes } from "../modules/userPreferences/routes/index.js";
import {
  LegacyProductConfigAgentRoutes,
  ProductConfigAgentRoutes,
} from "../modules/productConfigAgent/routes/productConfigAgent.routes.js";
import { PurchaseApplyRoutes } from "../modules/purchaseApply/routes.js";

export const AppRoutes = [
  ...AgentRuntimeRoutes,
  ...UserPreferenceRoutes,
  ...PurchaseApplyRoutes,
  ...ProductConfigAgentRoutes,
  ...LegacyProductConfigAgentRoutes,
];
