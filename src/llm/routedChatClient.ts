import type { LlmChatMessage } from "./deepseekClient.js";
import {
  getInferAiChatModel,
  normalizeInferAiChatModel,
  requestInferAiChatJson,
} from "./inferAiChatClient.js";
import {
  getXhModel,
  normalizeXhModel,
  requestXhChatJson,
} from "./xhClient.js";

export type RoutedLlmGateway = "xh" | "inferaichat";

const INFERAI_MODEL_PREFIX = "inferaichat:";
const INFERAI_MODEL_ALIAS_PREFIX = "inferai:";
const XH_MODEL_PREFIX = "xh:";

function normalizeGatewayName(value?: string): RoutedLlmGateway | undefined {
  const gateway = value?.trim().toLowerCase();
  if (!gateway) return undefined;
  if (gateway === "inferaichat" || gateway === "inferai") return "inferaichat";
  if (gateway === "xh") return "xh";
  return undefined;
}

function canonicalInferAiChatModel(model?: string): string | undefined {
  const selectedModel = model?.trim();
  if (!selectedModel) return undefined;
  return selectedModel.toLowerCase().startsWith(INFERAI_MODEL_ALIAS_PREFIX)
    ? `${INFERAI_MODEL_PREFIX}${selectedModel.slice(INFERAI_MODEL_ALIAS_PREFIX.length)}`
    : selectedModel;
}

export function resolveRoutedLlmGateway(model?: string): RoutedLlmGateway {
  const selectedModel = model?.trim().toLowerCase();
  if (selectedModel?.startsWith(INFERAI_MODEL_PREFIX)) return "inferaichat";
  if (selectedModel?.startsWith(INFERAI_MODEL_ALIAS_PREFIX)) return "inferaichat";
  if (selectedModel?.startsWith(XH_MODEL_PREFIX)) return "xh";
  return normalizeGatewayName(process.env.LLM_GATEWAY) ?? "inferaichat";
}

export function getRoutedChatModel(model?: string): string {
  const gateway = resolveRoutedLlmGateway(model);
  if (gateway === "inferaichat") {
    return getInferAiChatModel(
      canonicalInferAiChatModel(model || process.env.LLM_MODEL || process.env.INFERAI_MODEL),
    );
  }
  return getXhModel(model || process.env.LLM_MODEL || process.env.XH_MODEL);
}

export function normalizeRoutedChatModel(model?: string): string {
  const selectedModel = getRoutedChatModel(model);
  return resolveRoutedLlmGateway(selectedModel) === "inferaichat"
    ? normalizeInferAiChatModel(selectedModel)
    : normalizeXhModel(selectedModel);
}

export async function requestRoutedChatJson(params: {
  model?: string;
  purpose: string;
  messages: LlmChatMessage[];
  input?: unknown;
  maxTokens?: number;
  responseFormat?: "json_object";
  plugins?: Array<{ id: string; enabled?: boolean; [key: string]: unknown }>;
  retryEmptyContent?: number;
  stream?: boolean;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
}): Promise<string> {
  const model = getRoutedChatModel(params.model);
  if (resolveRoutedLlmGateway(model) === "inferaichat") {
    return requestInferAiChatJson({
      ...params,
      model,
      plugins: params.plugins ?? [{ id: "response-healing" }],
      retryEmptyContent: params.retryEmptyContent ?? 1,
      stream: params.stream ?? true,
    });
  }

  return requestXhChatJson({
    model,
    purpose: params.purpose,
    messages: params.messages,
    input: params.input,
    maxTokens: params.maxTokens,
    responseFormat: params.responseFormat,
  });
}
