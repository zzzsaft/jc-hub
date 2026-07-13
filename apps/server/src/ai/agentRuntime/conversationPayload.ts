import type { AgentRuntimeConversationMessage } from "./types.js";
import {
  decryptJsonWithSecret,
  encryptJsonWithSecret,
  type EncryptedPayload,
} from "../../modules/erpSqlAgent/query/crypto.js";

export type ConversationStoredMessage = {
  id: bigint | string;
  role: "user" | "assistant";
  content: string | null;
  inferenceJsonb: unknown;
};

function contextSecret(): string | undefined {
  return process.env.AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET ?? process.env.ERP_QUERY_CRYPTO_SECRET;
}

export function encryptConversationText(text: string): EncryptedPayload | undefined {
  const secret = contextSecret();
  return secret
    ? encryptJsonWithSecret({ text }, secret, "AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET")
    : undefined;
}

export function decryptConversationText(value: unknown): string | undefined {
  const secret = contextSecret();
  if (!secret || !isEncryptedPayload(value)) return undefined;
  try {
    const payload = decryptJsonWithSecret<{ text?: unknown }>(value, secret, "AGENT_RUNTIME_CONTEXT_CRYPTO_SECRET");
    return typeof payload.text === "string" ? payload.text : undefined;
  } catch {
    return undefined;
  }
}

export function buildRecentConversation(messages: ConversationStoredMessage[]): AgentRuntimeConversationMessage[] {
  return messages.slice(-12).flatMap((message) => {
    const content = decryptConversationText(message.inferenceJsonb)
      ?? (message.content && !message.content.startsWith("[protected ERP message") ? message.content : undefined);
    return content
      ? [{ id: String(message.id), role: message.role, content: content.slice(0, 2000) }]
      : [];
  });
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<EncryptedPayload>;
  return typeof payload.iv === "string" && typeof payload.tag === "string" && typeof payload.data === "string";
}
