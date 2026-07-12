import { agentRouteClassifier, type AgentRouteClassifier } from "./AgentRouteClassifier.js";
import type { AgentRuntimeRouteDecision } from "./types.js";

export async function routeAgentRuntimeMessage(
  message: string,
  options: { classifier?: AgentRouteClassifier; context?: unknown; preferredAgentType?: string; signal?: AbortSignal } = {},
): Promise<AgentRuntimeRouteDecision> {
  const classification = await (options.classifier ?? agentRouteClassifier).classify({
    message,
    context: options.context,
    preferredAgentType: options.preferredAgentType,
    signal: options.signal,
  });
  return {
    agentType: classification.agentType,
    confidence: classification.confidence,
    reason: classification.reasonCode,
    needsClarification: classification.needsClarification,
    clarificationMessage: classification.clarificationMessage,
  };
}
