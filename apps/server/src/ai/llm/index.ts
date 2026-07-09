export {
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekClient,
  requestDeepSeekJson,
  type LlmChatMessage,
} from "./deepseekClient.js";
export {
  getLocalModelClient,
  getLocalModelName,
  requestLocalModelJson,
} from "./localModelClient.js";
export {
  DEFAULT_XH_MODEL,
  getXhClient,
  getXhModel,
  normalizeXhModel,
  requestXhChatJson,
} from "./xhClient.js";
export {
  finishLlmCallLog,
  startLlmCallLog,
  type LlmCallLogStartParams,
} from "./llmCallLogger.js";
export {
  getRoutedChatModel,
  normalizeRoutedChatModel,
  requestRoutedChatJson,
  resolveRoutedLlmGateway,
  type RoutedLlmGateway,
} from "./routedChatClient.js";
