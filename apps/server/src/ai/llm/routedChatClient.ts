import {
  DEFAULT_DEEPSEEK_MODEL,
  requestDeepSeekJson,
  type LlmChatMessage,
} from "./deepseekClient.js";
import {
  getXhModel,
  normalizeXhModel,
  requestXhChatJson,
} from "./xhClient.js";

export type RoutedLlmGateway = "deepseek" | "xh";

const DEEPSEEK_MODEL_PREFIX = "deepseek:";
const XH_MODEL_PREFIX = "xh:";

function normalizeGatewayName(value?: string): RoutedLlmGateway | undefined {
  const gateway = value?.trim().toLowerCase();
  if (!gateway) return undefined;
  if (gateway === "deepseek") return "deepseek";
  if (gateway === "xh") return "xh";
  return undefined;
}

export function resolveRoutedLlmGateway(model?: string): RoutedLlmGateway {
  const selectedModel = model?.trim().toLowerCase();
  if (selectedModel?.startsWith(DEEPSEEK_MODEL_PREFIX)) return "deepseek";
  if (selectedModel?.startsWith("deepseek-")) return "deepseek";
  if (selectedModel?.startsWith(XH_MODEL_PREFIX)) return "xh";
  return normalizeGatewayName(process.env.LLM_GATEWAY) ?? "deepseek";
}

export function getRoutedChatModel(model?: string): string {
  const gateway = resolveRoutedLlmGateway(model);
  if (gateway === "deepseek") {
    const selectedModel = model || process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
    return selectedModel.startsWith(DEEPSEEK_MODEL_PREFIX)
      ? selectedModel.slice(DEEPSEEK_MODEL_PREFIX.length)
      : selectedModel;
  }
  return getXhModel(model || process.env.LLM_MODEL || process.env.XH_MODEL);
}

export function normalizeRoutedChatModel(model?: string): string {
  const selectedModel = getRoutedChatModel(model);
  if (resolveRoutedLlmGateway(selectedModel) === "deepseek") return selectedModel;
  return normalizeXhModel(selectedModel);
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
  signal?: AbortSignal;
  onStreamProgress?: (progress: {
    contentLength: number;
    chunkCount: number;
    finishReason?: string | null;
  }) => void;
}): Promise<string> {
  const model = getRoutedChatModel(params.model);
  const gateway = resolveRoutedLlmGateway(model);
  if (gateway === "deepseek") {
    return requestDeepSeekJson({
      model,
      purpose: params.purpose,
      messages: params.messages,
      input: params.input,
      maxTokens: params.maxTokens,
      signal: params.signal,
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
